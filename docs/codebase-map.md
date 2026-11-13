# Codebase Map — Markdown Hexer 2.0

> Scope: the 2.0 main line (`app/` only; 1.x lives at tag `v1.5.0` / branch `v1-final`)
> Last updated: 2026-11-08
> Purpose: context brief for agents. Read this before exploring `app/`.

## TL;DR

A native Rust desktop Markdown editor. One binary, no webview, no Node.js, no
network at startup. `eframe`/`egui` renders the shell, the Preview uses
`egui_commonmark` (which wraps `pulldown-cmark`), and the Edit mode is an
`egui::TextEdit` with app-side Markdown token colours. All document state lives
in a pure `Workspace` that is driven by a `Command` → `Effect` seam; the UI
executes Effects (file reads/writes, dialogs, exports) and feeds results back as
Commands. Platform work is behind traits (`FileSystem`, `Clipboard`, `Dialogs`,
`ImageSource`) so unit tests run without I/O.

## Stack & Tooling

| Concern | Value |
|---|---|
| Language | Rust 2024 edition, MSRV 1.95 |
| Shell | `eframe` 0.37 (Glow renderer) + `egui` 0.37 |
| Preview | `egui_commonmark` 0.26 + `pulldown-cmark` (GFM tables, strikethrough, task lists, footnotes) |
| Editor | `egui::TextEdit` plus `editor.rs` token highlighting (no full Markdown AST) |
| File dialogs | `rfd` |
| Images | `image` 0.25 (preview + base64 inlining for HTML Export) |
| Clipboard | `arboard` |
| Single instance | `interprocess` local socket / named pipe |
| Settings | `serde` + `serde_json`, one atomically-written file |
| Packaging | `cargo-packager` (NSIS, WiX, DMG, deb, AppImage), `cargo-generate-rpm`, Flatpak |
| Tests | inline `#[cfg(test)]` unit tests; `egui_kittest` UI tests in `app/src/ui/tests.rs`; `tempfile` |

## Commands

```sh
cd app
cargo run                     # debug app
cargo build --release         # target/release/markdown-hexer(.exe)
cargo test --all-targets      # unit + kittest UI tests
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

Packaging (from `app/`):

```sh
cargo install cargo-packager --locked
cargo packager --release --formats nsis,wix      # Windows
cargo packager --release --formats dmg           # macOS
cargo packager --release --formats deb,appimage  # Linux
```

RPM and Flatpak are CI-only (see `docs/release-2.0.md`). Version comes from the
git tag through `app/packaging/set_version.py`; never hand-edit the version for
a release.

## Directory Map

| Path | Responsibility |
|---|---|
| `app/src/main.rs` | Process entry: argv paths, single-instance acquire, settings load, eframe launch |
| `app/src/lib.rs` | Module list (library is `markdown_hexer`) |
| `app/src/icon.rs` | Bundled 128×128 PNG decoded for the native window icon |
| `app/src/domain.rs` | Pure domain: `Document`, `Tab`, `Workspace`, `Command`, `Effect`, guard/external/save state |
| `app/src/startup.rs` | Launch path handling through `Workspace` (`paths_from_args`, `launch`) |
| `app/src/editor.rs` | Markdown token scanner + cached `LayoutJob`; no AST |
| `app/src/preview.rs` | Sanitized Preview source, Sections tree, fenced-code extraction, render tree |
| `app/src/sections.rs` | Section keys and collapse state |
| `app/src/find.rs` | Literal, case-insensitive Find & Replace helpers over `FindState` |
| `app/src/format.rs` | Pure formatting actions on character ranges |
| `app/src/first_edit.rs` | First-Edit probe: lazy editor initialization |
| `app/src/export.rs` | Standalone HTML Export, base64 image inlining |
| `app/src/image.rs` | Document-directory image scope (`ImageSource`) |
| `app/src/settings.rs` | Theme/font/text-size JSON settings and platform path |
| `app/src/dialogs.rs` | `Dialogs` trait + `rfd` implementations (open/save/guard/external/export) |
| `app/src/platform.rs` | `FileSystem`/`Clipboard` traits, native impls, URL allowlist, BOM handling |
| `app/src/platform/instance.rs` | Single-instance socket/named pipe and path forwarding |
| `app/src/ui/mod.rs` | `HexerApp`: tabs, toolbar, editor/preview panes, Find panel, About, Effects execution |
| `app/src/ui/palette.rs` | Complete colour-token palettes (Light, House, Dark, High Contrast, Nord, Terminal Green) |
| `app/src/ui/find.rs` | Find & Replace panel |
| `app/src/ui/tests.rs` | `egui_kittest` UI tests (harness, dialogs, clipboard, temp files) |
| `app/packaging/` | Packaging config, association contract, NSIS/WiX/macOS/Linux/Flatpak assets |
| `app/packaging/icons/` | App icons used by all bundles |
| `docs/adr/` | Architecture decision records (index says which still govern 2.0) |
| `.github/workflows/build.yml` | App-only PR/push checks |
| `.github/workflows/release.yml` | Tag-driven draft release with all platform bundles |

## Entry Points

1. `main.rs` reads non-flag argv paths, then `instance::acquire(paths)`:
   `Acquire::Forwarded` means a running instance took the paths and this process
   exits; otherwise it keeps the `InstanceServer`.
2. `startup::launch(paths, &NativeFileSystem)` builds a `Workspace`: a bare
   launch creates `Untitled.md` in Edit; each file path is canonicalized and
   opened through `Command::OpenPath`, Effects perform reads, and failures
   surface as a startup notice.
3. Settings are loaded before the window so the first frame has the right
   palette; the window starts hidden until the first frame paints.
4. `HexerApp::new(startup, t_main)` owns the UI; `t_main` feeds the Cold Start
   timer.

## Architecture & Data Flow

**Command/Effect seam (`domain.rs`).** `Workspace::apply(Command) -> Vec<Effect>`
is pure. Commands cover New/Open/Save/Save As/Close/Quit, content edits,
mode changes, Find & Replace, external checks, guard choices, export, and
dialog results. Effects ask the shell to show a dialog, read/write a file, open
a URL, export, or close a window. `HexerApp` drains a `VecDeque<Effect>`, does
the I/O through `platform.rs`/`dialogs.rs`, and pushes result Commands back.
This keeps dirty tracking, tab lifecycles, and guard flows testable without a
window.

**Document/Tab.** A `Document` holds `id`, optional `path`, `untitled_number`,
`content`, `saved_content`, `mode` (Preview/Edit), per-Document `FindState`, and
a `revision` counter. Dirty = `content != saved_content`. A file-backed
Document starts in Preview; a bare Untitled starts in Edit. Per-Document editor
and scroll state lives in egui memory keyed by `DocumentId`; `FindState` lives
on the Document. The window title is `<name>[*] — Markdown Hexer`.

**Preview pipeline.** `preview.rs` parses the Markdown once (raw HTML is
dropped, GFM options), derives Sections and extracts fenced code into app-rendered
blocks, and produces `render_markdown` with sentinels for those blocks.
`egui_commonmark` renders it; the app supplies palette-aware syntax colours and
independent scrolling for fenced code. The `PreparedPreview`/`RenderTree` data
is the renderer seam. A first-frame variant may use a cheaper tree until the
first paint completes. Local images are served only through `ImageSource`,
scoped to the Document's directory; remote images keep their URL.

**Edit mode.** `TextEdit` is created lazily on first Edit (`first_edit.rs`), so
a Preview launch never pays editor cost. `editor.rs` scans Markdown tokens
(line/token level, no AST) and builds a cached `LayoutJob` keyed by revision.
Undo history belongs to the per-Document `EditorSession`, so switching tabs
preserves each Document's history; nothing survives a restart.

**Find & Replace.** Matching is literal and case-insensitive; `find.rs` exposes
pure helpers used by both the panel and Workspace commands, so match ranges
agree. Opening Find from Preview switches that Document to Edit first.

**Guard and external changes.** Closing a Dirty tab, quitting, or opening over a
Dirty Document goes through a Save/Don't Save/Cancel guard. On window focus the
Workspace checks the active file's identity/mtime/content; a changed clean file
reloads silently, a changed Dirty file asks Reload/Overwrite/Cancel. Saves write
clean UTF-8 (no BOM); loads strip one leading BOM.

**Copy-on-Select.** Releasing a mouse selection in Preview copies the selected
text as plain text; fenced code blocks also show a hover Copy button.

**HTML Export.** `export.rs` renders the same Markdown policy as Preview into a
standalone HTML file. Local images are inlined as base64 (within the Document
directory), remote images keep their URL, and missing images degrade to alt
text. No scripts, remote CSS, or fonts are embedded.

**Single instance.** `platform/instance.rs` binds a per-user local socket
(named pipe on Windows, Unix socket mode 0600) and forwards later launches'
paths to the first process, which opens or focuses them. No TCP port is opened.

**Settings.** `settings.json` holds Theme (System + six palettes), font choice,
and text size. It is written atomically through a `.tmp` rename. A missing,
corrupt, or unreadable file silently yields defaults; a bad file never blocks
startup. Paths: `%APPDATA%\markdown-hexer\settings.json`,
`~/Library/Application Support/markdown-hexer/settings.json`, or
`$XDG_CONFIG_HOME/markdown-hexer/settings.json`. No session or tab state is
persisted.

**Platform traits.** `FileSystem` (read/write/canonicalize/metadata/rename),
`Clipboard`, `Dialogs`, and `ImageSource` have native implementations used by
`main.rs`; tests inject fakes. `open_url` allows only `http`, `https`, and
`mailto` and hands them to the OS handler, never to a shell.

## Conventions

- Domain logic stays pure and in `domain.rs`; the UI does I/O and effects only.
- Unit tests are inline `#[cfg(test)]` next to each module. UI tests use
  `egui_kittest` in `app/src/ui/tests.rs` with temp files and fake dialogs.
- Colour comes only from `ui/palette.rs` tokens; a new Theme must be a complete
  token set. System is a preference, not a Palette.
- No `unwrap()` on user-controlled I/O paths; recoverable failures become
  notices or dialog choices.
- No network calls in the startup path; images may load over HTTP only when a
  Document references a remote image.
- Version is `CARGO_PKG_VERSION`; release CI rewrites it from the tag. Do not
  hard-code a second version anywhere (About, bundles, docs all read it).
- Print/PDF export is out of scope until 2.1; do not add a stub that pretends
  otherwise.
- 1.x code does not exist on this branch. Do not reintroduce Tauri, npm, or
  `src-tauri/` references.

## Gotchas

- **Effects must be drained.** `Workspace::apply` only describes I/O; forgetting
  to execute an Effect leaves a dialog or save hanging. Follow the existing
  `VecDeque` loop in `HexerApp`.
- **Editor state is per Document** (`EditorSession` keyed by `DocumentId`).
  Rebuilding a Document's editor clears undo history and scroll; do not rebuild
  on a mere tab switch.
- **First Edit is a probe,** not a mode change side effect. Preview must not
  construct editor state; the startup path intentionally avoids it.
- **Preview and Export share the parser policy.** Changing sanitization or GFM
  options in one must change the other; tests pin identical output rules.
- **Image access is scoped** to the Document's directory (canonicalized, no
  `..` escape). Untitled Documents have no scope.
- **Window title has two consumers**: the OS viewport title and the in-app tab
  strip. Keep `Workspace::window_title` as the single format source.
- **Association contract is duplicated** in `app/Cargo.toml`
  (`[package.metadata.packager]`), the NSIS template, the WiX fragment, the
  macOS Info.plist, the Linux MIME XML, and the Flatpak manifest. Change them
  together; `docs/os-associations.md` is the spec.
- **NSIS uninstall** uses the patched template in
  `app/packaging/windows/installer.nsi` (upstream cargo-packager 0.11.8 never
  removes associations). Do not switch back to the upstream template.
- **WiX is per-machine** by design; silent installs need elevation. The NSIS
  installer is per-user and needs none.
- **macOS needs `--formats app,dmg`**: a bare `dmg` run deletes the `.app`
  afterwards, and `app` alone is not Windows-safe (not cfg-gated). Use
  `nsis,wix` on Windows for final tags and `nsis` for prerelease tags.
- **Version strings:** prerelease tags keep their suffix in the display Version,
  but WiX rejects a non-numeric prerelease, so prerelease tags skip the MSI.
- **Settings write is atomic** via `.tmp` + rename; tests assert no `.tmp`
  residue. Keep it that way.
- **Defender/AV noise:** each WiX packaging run on the dev host produced
  `MsiInstaller` 1033 events with no installed product. That is environmental,
  not an installer bug; a real MSI smoke must run elevated and check
  `InstallFinalize` in the log.
