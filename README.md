# Markdown Hexer

> **Early development — expect breaking changes.** Markdown Hexer is actively developed and changes fast: UI, behavior, and the document model can shift between releases without notice. Bug reports are welcome regardless — see [Reporting bugs](#reporting-bugs).

A cross-platform, distraction-free Markdown editor built with Tauri 2, Vue 3, and CodeMirror 6. Multiple Documents in Tabs, a live-rendered Preview Pane, and native file-system integration.

## Features

- **Tabs** — multiple Documents open at once in a Tab Bar, each keeping its own content, Dirty state, Layout Mode, Find & Replace state, and editor cursor/scroll/undo history. `Cmd/Ctrl+T` New Tab, `Cmd/Ctrl+W` Close Tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` to switch.
- **Live preview** — the Editor Pane renders Markdown (GFM: tables, strikethrough, task lists, autolinks) into the Preview Pane as you type, sanitized with DOMPurify and syntax-highlighted with Prism (~12 curated languages).
- **Three Layout Modes** — Split View (default for New Documents, Synced Scrolling active), Preview Only (auto-chosen on Open), and Focus Mode. Cycle with `Cmd/Ctrl+Shift+P`; each Document remembers its own mode.
- **Synced Scrolling** — block-anchored, one-way (Editor → Preview) scrolling in Split View, so you always see the rendering of what you're editing.
- **File lifecycle** — `Cmd/Ctrl+S` Save (Save As for an Untitled Document), `Cmd/Ctrl+Shift+S` Save As, `Cmd/Ctrl+O` Open, `Cmd/Ctrl+N` New. A Dirty asterisk (`*`) in the Tab and window title tracks unsaved changes.
- **Confirm-Discard Guard** — native Save / Don't Save / Cancel dialog before closing a Dirty Tab or the app discards unsaved work.
- **Externally-Modified detection** — on window focus, the app detects when the file changed on disk: silent reload when clean, Reload / Overwrite / Cancel when Dirty.
- **Editing** — full undo/redo, toolbar + `Cmd/Ctrl+B`/`Cmd/Ctrl+I` formatting (bold, italic, heading, list, link, code), and `Cmd/Ctrl+F` find & replace (replace in Preview Only switches to a source-visible mode first).
- **Images & links** — relative image paths resolve against the Document's directory via a scoped `asset://` protocol; links open in the system browser.
- **Appearance** — Theme follows the OS (System) or one of six curated Palettes (Light, House, Dark, High Contrast, Nord, Terminal Green), plus a curated font picker for both panes; preferences persist across launches.
- **OS integration** — open `.md`/`.markdown`/`.mdown`/`.txt` via double-click (file associations) or drag-and-drop; a second launch opens the file in the running window (single instance). BOM-prefixed files open cleanly and save as clean UTF-8.

## Reporting bugs

Found something broken? Open an issue: <https://github.com/ALi-strg/markdown-editor/issues/new/choose>. Please use the bug report template and include your OS, the version you're running, and reproduction steps. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution policy — note that **pull requests are not currently accepted**.

## Tech Stack

| Concern | Choice |
|---|---|
| Shell | Tauri 2 (Rust) with `dialog`, `opener`, `single-instance` plugins |
| Frontend | Vue 3 (Composition API), Pinia, Vite, TypeScript |
| Editor | CodeMirror 6 (`@codemirror/lang-markdown`) |
| Rendering | `marked` → `DOMPurify` → `prismjs` (`marked-highlight`) |
| Tests | Vitest (unit), Rust `cargo test`, WebdriverIO + tauri-driver (E2E) |

The frontend owns document state (`src/stores/document.ts`); the CodeMirror editor is authoritative for edits and the store mirrors it. The Rust side is a thin command layer: file I/O, native dialogs, window title, single-instance forwarding, and the scoped `asset://` protocol.

## Development

```sh
npm install
npm run tauri dev        # full desktop app (Vite dev server on port 1420)
```

`npm run dev` runs the Vite dev server alone; `npm run tauri build` produces a release bundle.

## Tests

```sh
npm test                # Vitest — Pinia stores, components, pure functions (jsdom)
cargo test              # Rust backend unit tests (run from src-tauri/)
npm run test:e2e        # WebdriverIO + tauri-driver, full app (rebuilds a debug binary)
```

The E2E suite needs the WebDriver driver installed once (`cargo install tauri-driver`); CI installs it automatically.

The E2E suite stubs the native dialogs via a `VITE_E2E` build-time seam (`src/lib/guardDialog.ts`, `src/lib/openDialog.ts`, ...) so the real flows still run through the real Tauri commands.

## CI

`.github/workflows/build.yml` builds all three platforms (macOS, Linux, Windows) on push to `main` and on `v*` tags, runs the unit test suites on every platform, the E2E suite on Linux, and emits Windows x64 + arm64 bundles. Tag pushes produce a draft GitHub release with the installers attached.

## Documentation

- `CONTEXT.md` — domain vocabulary (Editor Pane, Preview Pane, Synced Scrolling, Dirty, Confirm-Discard Guard, ...). Use it in all code and docs.
- `docs/PRD.md` — the product specification and implementation decisions.
- `docs/adr/` — architectural decision records (editor engine, rendering pipeline, multi-tab document model, release versioning, license, contribution policy).
- `docs/slices/` — the incremental build plan the codebase was developed against.
- `docs/codebase-map.md` — a context brief for navigating the code.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+S` / `Cmd/Ctrl+Shift+S` | Save / Save As |
| `Cmd/Ctrl+N` | New Document |
| `Cmd/Ctrl+O` | Open Document |
| `Cmd/Ctrl+T` / `Cmd/Ctrl+W` | New Tab / Close Tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / Previous Tab |
| `Cmd/Ctrl+B` / `Cmd/Ctrl+I` | Bold / Italic |
| `Cmd/Ctrl+F` | Find & Replace |
| `Cmd/Ctrl+Shift+P` | Cycle Layout Modes |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / Redo |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: **bug reports are welcome, pull requests are not currently accepted** — the codebase is evolving too fast for external PRs to be actionable.

## License

MIT — see [LICENSE](LICENSE). © 2026 Adrian Link.
