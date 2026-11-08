# Markdown Hexer

> **2.0 — native rewrite.** Markdown Hexer is a fast, distraction-free desktop Markdown editor written in Rust with [egui](https://github.com/emilk/egui). Expect breaking changes between releases.

Markdown Hexer opens Markdown files in tabs, renders them with a native preview (no webview), and edits them in place. It is a single native binary; there is no Electron, Tauri, or browser runtime underneath.

## Features

- **Tabs** — each Document keeps its own content, Dirty state, mode, Sections, Find & Replace state, and editor undo history. `Ctrl+T` / `Ctrl+W` open and close tabs; `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle them.
- **Two modes** — **Preview** (default for opened files) and **Edit**. `Ctrl+E` toggles the Active Document. The editor initializes lazily the first time a Document enters Edit, so a preview launch stays fast.
- **Native preview** — CommonMark plus GFM tables, strikethrough, task lists, and footnotes; headings, lists, blockquotes, fenced code with syntax colors, images, and links. Raw HTML is not rendered.
- **Sections** — every heading starts a collapsible Section; collapse state is per tab and session-only.
- **Editing** — undo/redo, bold/italic/heading/list/link/code formatting, and `Ctrl+F` Find & Replace (Find from Preview switches to Edit first).
- **File lifecycle** — `Ctrl+S` Save, `Ctrl+Shift+S` Save As, `Ctrl+O` Open, `Ctrl+N` New. A Dirty `*` marks the tab and window title. A native Confirm-Discard Guard protects unsaved work; externally modified files prompt Reload / Overwrite / Cancel.
- **Copy from Preview** — ending a mouse selection in Preview copies it as plain text (Copy-on-Select); fenced code blocks get a hover Copy button.
- **Appearance** — System theme or one of six Palettes (Light, House, Dark, High Contrast, Nord, Terminal Green), plus a shared text size.
- **HTML Export** — writes a self-contained `.html` file; local images are inlined as base64. Print/PDF export is deferred to 2.1.
- **OS integration** — opens `.md`, `.markdown`, and `.mdown` from the file manager, drag-and-drop, or the command line; a second launch opens the file in the running window.
- **No telemetry, no auto-update, no network at startup.** Settings are stored locally; there is no session restore.

## Install

Download the Bundle for your platform from [GitHub Releases](https://github.com/ALi-strg/markdown-editor/releases). The draft release is published by the maintainer; release assets are unsigned.

| Platform | Bundle | Install |
|---|---|---|
| Windows | `markdown-hexer_<version>_windows-x64.exe` | Per-user NSIS installer. Registers `.md`/`.markdown`/`.mdown` for the current user. |
| Windows | `markdown-hexer_<version>_windows-x64.msi` | Per-machine WiX installer (requires elevation). Registers the extensions for all users. |
| macOS | `markdown-hexer_<version>_macos-aarch64.dmg` | Open the DMG, drag **Markdown Hexer** to Applications. |
| macOS | `markdown-hexer_<version>_macos-aarch64.app.tar.gz` | Portable `.app` for scripted installs. |
| Debian/Ubuntu | `markdown-hexer_<version>_linux-x86_64.deb` | `sudo apt install ./markdown-hexer_<version>_linux-x86_64.deb` |
| Fedora/RHEL | `markdown-hexer_<version>_linux-x86_64.rpm` | `sudo dnf install ./markdown-hexer_<version>_linux-x86_64.rpm` |
| Linux | `markdown-hexer_<version>_linux-x86_64.AppImage` | `chmod +x`, then run. |
| Linux | `markdown-hexer_<version>_linux-x86_64.flatpak` | `flatpak install markdown-hexer_<version>_linux-x86_64.flatpak` |

macOS builds are unsigned and not notarized: Gatekeeper blocks the first launch until you right-click the app and choose **Open** (or clear the quarantine attribute yourself). Windows shows a SmartScreen warning for the unsigned installers. Linux packages are unsigned too. See [docs/release-2.0.md](docs/release-2.0.md) for the full caveats and the release smoke checklist.

### File associations

- **Windows NSIS**: current-user associations under `HKCU\Software\Classes`, ProgID `MarkdownHexer.Document`, open command `<install-dir>\markdown-hexer.exe "%1"`, icon from the same executable. The uninstaller restores any previous association.
- **Windows MSI**: the same ProgID and command, machine-wide under `HKLM\Software\Classes`.
- **macOS**: declares the `net.daringfireball.markdown` UTI and registers the app as an Alternate handler for Markdown documents.
- **Linux**: ships `markdown-hexer.desktop` with `MimeType=text/markdown` and a shared-mime-info entry covering `*.md`, `*.markdown`, and `*.mdown`. The Flatpak carries the same declarations under its app id.

The association contract is documented in [docs/os-associations.md](docs/os-associations.md).

## Build from source

Requires Rust 1.95 or newer (the workspace pins `edition = "2024"`).

```sh
cd app
cargo build --release        # target/release/markdown-hexer(.exe)
cargo test --all-targets
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

The app lives entirely in `app/`; there is no Node.js, npm, or web toolchain.

## Packaging

Bundles are built with [cargo-packager](https://github.com/crabnebula-dev/cargo-packager):

```sh
cargo install cargo-packager --locked
cd app
cargo build --release

cargo packager --release --formats nsis,wix   # Windows
cargo packager --release --formats dmg        # macOS (.app + .dmg)
cargo packager --release --formats deb,appimage  # Linux
```

RPM is produced by `cargo-generate-rpm`; the Flatpak bundle wraps the release `.deb` in a pinned GNOME runtime (ADR-0006). Both run in CI only. Platform configs and the association contract live in `app/packaging/`.

The Version is the git tag without its leading `v`. `app/packaging/set_version.py` rewrites the single version in `app/Cargo.toml`, so the About Dialog (`CARGO_PKG_VERSION`) and every Bundle read the same value. CI does this from `GITHUB_REF_NAME`; locally the checked-in version is the development baseline.

## CI

- `.github/workflows/build.yml` runs on pull requests and pushes to `main` / `2.0-rewrite` that touch `app/`: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --all-targets`, plus a Windows release build.
- `.github/workflows/release.yml` runs on `v*` tags: derives the Version, builds Windows (`nsis`, `wix`), macOS (`dmg`, `.app.tar.gz`), and Linux (`deb`, `AppImage`, `rpm`, Flatpak) assets, then creates a **draft** GitHub Release. Tags with a semver prerelease segment are marked prerelease.

No signing keys or notarization secrets are configured.

## Version 1.x

1.x (Tauri/Vue) is frozen at tag `v1.5.0` and branch `v1-final`. It is not maintained and there is no migration path: 2.0 does not read 1.x settings or restore sessions. Bug fixes for 1.x branch from `v1.5.0`.

## Documentation

- [GLOSSARY.md](GLOSSARY.md) — domain vocabulary used across the code and docs.
- [docs/release-2.0.md](docs/release-2.0.md) — artifact names, install/uninstall, signing caveats, smoke checklist.
- [docs/os-associations.md](docs/os-associations.md) — the per-platform file-association contract.
- [docs/codebase-map.md](docs/codebase-map.md) — architecture map of the 2.0 app.
- [docs/adr/](docs/adr/README.md) — architecture decision records; the index says which still govern 2.0.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` / `Ctrl+O` | New / Open |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As |
| `Ctrl+T` / `Ctrl+W` | New Tab / Close Tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / Previous Tab |
| `Ctrl+Shift+PgUp` / `Ctrl+Shift+PgDn` | Move Tab left / right |
| `Ctrl+E` | Toggle Preview / Edit |
| `Ctrl+F` | Find & Replace |
| `Ctrl+B` / `Ctrl+I` | Bold / Italic |
| `Ctrl+/` | About |

`Ctrl` is `Cmd` on macOS.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports are welcome; pull requests from outside the Collaborator circle are not currently accepted.

## License

MIT — see [LICENSE](LICENSE). © 2026 Adrian Link.
