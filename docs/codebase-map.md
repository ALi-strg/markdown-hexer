# Codebase Map — markdown-editor (Markdown Hexer)

> Scope: whole repo
> Last updated: 2026-09-03
> Purpose: Context brief for agents. Read this before working in this area.

## TL;DR
A cross-platform Tauri 2 desktop app: a distraction-free Markdown editor with a live rendered Preview Pane and native file-system integration. Vue 3 + Pinia + TypeScript frontend (Vite 6, CodeMirror 6 editor), Rust Tauri backend for file I/O, native dialogs, asset serving, and window title. The frontend is the source of truth for document state; the Rust side is a thin, command-based shell. Tests: Vitest (unit), `cargo test` (Rust), WebdriverIO + tauri-driver (E2E).

## Stack & Tooling
| Concern | Value |
|---|---|
| Languages | TypeScript (Vue 3), Rust (Tauri 2), CSS |
| Frontend | Vue 3 + Pinia + Vite 6 + CodeMirror 6 (`@codemirror/*`) |
| Markdown pipeline | `marked` (lexer/parser) → `DOMPurify` (sanitize) → `prismjs` (highlight) |
| Native shell | Tauri 2; plugins: `dialog`, `opener`, `single-instance` |
| Package manager | npm |
| Build | `vue-tsc --noEmit && vite build`; Rust via `tauri build` |
| Test | Vitest (jsdom) + `cargo test` + WebdriverIO/tauri-driver |
| Product name | Markdown Hexer (identifier `com.markdownhexer.editor`); repo slug `markdown-editor` |

## Commands
```
# run app (dev)
npm install
npm run tauri dev            # full app; vite runs on strict port 1420

# frontend
npm run dev                  # vite dev server only (http://localhost:1420)
npm run build                # vue-tsc --noEmit && vite build -> dist/
npm run preview

# tests
npm test                     # vitest run (src/**/*.spec.ts, jsdom)
npm run test:watch
npm run test:e2e             # wdio run wdio.conf.ts (rebuilds debug app, spawns tauri-driver)
cargo test                   # from src-tauri/ (inline #[cfg(test)] per module)

# tauri CLI passthrough
npm run tauri build -- --debug --no-bundle   # what test:e2e uses to build the app
```

## Directory Map
| Path | Responsibility |
|---|---|
| `src/` | Vue frontend (source root, Vite) |
| `src/components/` | Vue components (editor, preview, toolbar, find panel) |
| `src/lib/` | Logic: dialogs, formatting, rendering, scroll sync, debounce, find/replace helpers |
| `src/stores/` | Pinia stores: `document`, `settings`, `ui` |
| `src/__tests__/` | Colocated Vitest specs (`*.spec.ts`), one `__tests__/` dir per area |
| `src-tauri/` | Rust backend (`src/`), Tauri config, capabilities, icons |
| `src-tauri/capabilities/` | Permission grants for the `main` window |
| `e2e/specs/` | WebdriverIO E2E specs (23 files, one per feature) |
| `docs/` | `adr/` (11 ADRs), `agents/` (agent workflow docs), `codebase-map.md` (this file), `theme-mapping.md` |
| `.scratch/` | Local issue tracker: one markdown file per feature (see `docs/agents/issue-tracker.md`) |
| `.github/workflows/build.yml` | CI: build+release matrix (macOS/Linux/Windows), tauri-action |

## Entry Points
- `index.html` → `src/main.ts` (`createApp(App).use(createPinia())`) → `src/App.vue`.
- `src-tauri/src/main.rs` → `markdown_editor_lib::run()` (`src-tauri/src/lib.rs`), which registers plugins, the `asset://` protocol, managed state, and all `#[tauri::command]` handlers.

## Architecture & Data Flow

**IPC surface** (frontend `invoke` ↔ Rust commands, all in `src-tauri/src/lib.rs`):
| Command | Rust fn | Purpose |
|---|---|---|
| `set_document_title` | `set_document_title` | OS title `<filename> [*] — Markdown Hexer` (`title.rs`) |
| `save_document` | `save_document` | Write content as clean UTF-8 (`save.rs`) |
| `open_document` | `open_document` | Read UTF-8, strip leading BOM (`open.rs` → `encoding.rs`) |
| `inspect_document` | `inspect_document` | Content+mtime for Externally-Modified detection (`inspect.rs`) |
| `set_asset_root` | `asset::set_asset_root` | Update `asset://` scope root on path change (`asset.rs`) |
| `get_pending_file` | `get_pending_file` | Pull+clear launch/forwarded file path (`instance.rs`) |
| `show_confirm_discard` | `confirm::show_confirm_discard` | Native Save/Don't Save/Cancel dialog (`confirm.rs`) |
| `show_external_modified` | `external::show_external_modified` | Native Reload/Overwrite/Cancel dialog (`external.rs`) |

**Document lifecycle** (`src/stores/document.ts` is the hub):
- Edit: CodeMirror `updateListener` in `EditorPane.vue` → `document.mirrorContent()` → `content` ref. **The editor is authoritative; the store never writes back into it.**
- New/Open/Reload go through the **Tab-session controller** (`src/lib/tabEditorState.ts`, exposed as `editorPane.tabSession`): `runTabSwitch({ capture?, swap, after })` enforces the protocol — capture the outgoing Tab's editor state into the WeakMap, run the store swap, close the Find & Replace overlay (`onSwitched` hook), restore the incoming Tab's preserved state or rebuild destructively (`after: "restore" | "rebuild"`), check the restored Tab for external changes (`onRestored` hook). External reload calls `tabSession.rebuild()`. Rebuilds **clear undo history** and scroll to top.
- The controller unit-tests against a fake EditorView (`src/lib/__tests__/tabEditorState.spec.ts`); the preserved CodeMirror state must never pass through a Vue reactive proxy (breaks CM's strict state-identity checks on dispatch).
- Dirty = `content !== savedContent`; `savedContent`/`diskContent` are the two baselines (saved state vs what's on disk).
- Save (`Ctrl/Cmd+S`): `document.save()` → Save As for Untitled (`saveAs()` → `pickSavePath`) → `save_document` → update `canonicalPath`/`savedContent`/`diskContent`, `syncAssetRoot()`, set last-directory.
- Open (`Ctrl/Cmd+O`): `pickOpenPath` → `document.openPathInTab(path)` → new Tab (Preview Only, chosen on the Tab record) made Active; no Confirm-Discard Guard. Same path already open → the existing Tab is focused instead (one Tab per path). Drag-drop and OS file-open share this path.
- New (`Ctrl/Cmd+N`): `runNewDocument()` → `document.newTab()` → numbered Untitled Tab (Split View, chosen on the Tab record) made Active; no Guard. `+` affordance calls the same action.
- Confirm-Discard Guard (`src/lib/confirmDiscard.ts`): clean → proceed; dirty → native dialog (`guardDialog.ts` → Rust `confirm.rs`).
- Externally-Modified: window focus (`onFocusChanged` in `App.vue`) → `document.checkExternalModification()` → `inspect_document`; compare to `diskContent`; clean → silent reload, dirty → native dialog (`externalDialog.ts` → Rust `external.rs`) with Reload/Overwrite/Cancel.
- Drag-and-drop (`onDragDropEvent`) and second-instance opens (`listen("file-open-requested")`, startup `get_pending_file`) share `openPath` → same add-or-focus Open path (no Guard).

**Rendering** (`PreviewPane.vue` + `src/lib/renderer.ts` + `src/lib/sections.ts`):
- Watches `document.content`/`canonicalPath` → debounced 200ms → `renderMarkdown(source, { wrapBlocks: true })`.
- `deriveBlocks(source)` (`src/lib/blockMap.ts`) is the **single lex pass** shared by renderer and Synced Scrolling: one filter over `SKIP_BLOCK_TOKEN_TYPES` yields `{ keptTokens, ranges }` — renderer block indices and scroll-sync ranges agree by construction, pinned by an invariant test in `blockMap.spec.ts`.
- Block-anchored mode: renderer highlights code via Prism, `wrapSections(keptTokens, ...)` (`sections.ts`) wraps blocks in `<div class="md-block" data-block-index="N">` and nests Sections (`<div class="md-section" data-section-key="hN:Heading#k">`), then `DOMPurify.sanitize`. (Non-block mode used by tests.)
- **Section DOM contract lives in `sections.ts`** (build via `wrapSections`, query via `sectionByKey`, mutate via `setSectionCollapsed`/`applyCollapsedSections`/`toggleSection`). The chevron is a real `▸` text node in the markup (rotation stays CSS); `sections.ts` is DOM-only — `PreviewPane.vue` keeps the `collapsedSections` write on the Tab record.
- Relative `<img>` srcs rewritten to `asset://` URLs (`assetUrl.ts` → `convertFileSrc`); Rust `asset.rs` re-checks canonical path stays inside the Document's directory.
- Preview link clicks open the system browser via `plugin-opener` (`onPreviewClick`).

**Synced Scrolling** (`src/lib/useSyncedScrolling.ts` + `blockMap.ts`):
- Editor scroll → compute top visible line → `deriveBlocks(source).ranges` (cached per source) → binary search via `findBlockIndexForLine` → scroll preview to `[data-block-index]`, auto-expanding collapsed Sections it crosses. Active only in Split View; one-way editor→preview; block-anchored, never proportional.

**Layout/UI** (`src/stores/ui.ts`): `layoutMode` is a per-Tab record field — chosen at Tab creation (New → Split View, Open → Preview Only) — surfaced to the window as a computed over the Active Tab; the Layout Switcher and `Ctrl/Cmd+Shift+P` mutate only the Active Tab's mode. `dividerPosition` (0..1, clamped 0.15–0.85) stays app-wide (persisted only in-session), plus `findOverlayOpen`, `toast`, `lastDirectory`. Modes never persist across launches.

**Settings** (`src/stores/settings.ts`): Theme (seven states — `system` default + Palettes `light`/`house`/`dark`/`high-contrast`/`nord`/`terminal-green`; System resolves to Light/Dark via `matchMedia`, so `data-theme` always carries a Palette), font (`default`/`serif`/`sans`/`mono`), and text size (`small`/`medium`/`large`, medium default); persisted in localStorage under `markdownhexer:settings`; applied via `data-theme`/`data-font`/`data-text-size` attributes on the app root.

**Asset scope protocol** (`asset.rs`): `DocumentScope` state holds the current path; `asset://` requests must be absolute, canonicalized, and inside the Document's directory (403 otherwise, 404 if missing). MIME sniffed.

## Key Modules / Files
| File | Role |
|---|---|
| `src/App.vue` | Orchestrator: global shortcuts (`onKeydown` line 262), window events (close-request, focus, drag-drop, file-open-requested), divider drag, layout/style wiring |
| `src/components/EditorPane.vue` | CodeMirror 6 mount; mirrors edits into store; owns extensions/state creation; creates and exposes the Tab-session controller (`tabSession`) and flushes its deferred scroll on Layout Mode change; routes CM search panel into a hidden off-screen host |
| `src/components/PreviewPane.vue` | Debounced render, `asset://` img rewrite, external-link opening; Section toggling via the `sections.ts` seam |
| `src/components/FindReplacePanel.vue` | App-hosted find/replace UI; owns the never-edit-blind gate (`withVisibleSource` + `setTrackedMatch`) and exposes `open()` (showSource + focus) |
| `src/components/Toolbar.vue` | Format buttons (bold/italic/heading/list/link/code) + Theme/Font/Size selects; About button opens the About Dialog |
| `src/components/AboutDialog.vue` | Modal with product name, bundle Version (via `get_app_version`), GitHub repo link, and the grouped Shortcuts Reference (`SHORTCUT_GROUPS`); `Ctrl/Cmd+/` toggles it |
| `src/stores/document.ts` | Document state, save/open/new/reload/external-modification logic |
| `src/stores/settings.ts` | Theme + font + text size, localStorage persistence |
| `src/stores/ui.ts` | Layout mode, divider, toast, last-directory |
| `src/lib/formatting.ts` + `editorFormatting.ts` | Pure markdown formatting (bold/italic/…), applied as a single undoable CM transaction |
| `src/lib/shortcuts.ts` | Single shortcut registry: toolbar tooltips + the About Dialog's Shortcuts Reference (`SHORTCUT_GROUPS`), incl. `THEME_CONTROL`/`FONT_CONTROL`/`SIZE_CONTROL` (label-only entries) |
| `src/lib/findReplace.ts` | Match-count / next / prev helpers over CM search state |
| `src/lib/blockMap.ts` | `deriveBlocks` — the single lex pass behind renderer anchors and Synced Scrolling ranges |
| `src/lib/sections.ts` | Section DOM seam: build/query/mutate for collapsible Sections (see CONTEXT.md) |
| `src/lib/tabEditorState.ts` | Tab-session controller (`createTabSession`) + per-Tab preserved editor state (WeakMap) |
| `src/lib/{open,save}Dialog.ts`, `guardDialog.ts`, `externalDialog.ts` | Native dialog wrappers with E2E localStorage stubs |
| `src-tauri/src/asset.rs` | Scoped `asset://` serving |
| `src-tauri/src/{save,open,encoding,inspect}.rs` | File I/O (clean UTF-8, BOM handling) |
| `src-tauri/src/instance.rs` | Single-instance/launch-arg file forwarding |
| `src-tauri/src/{confirm,external}.rs` | Native dialog definitions |
| `src-tauri/src/title.rs` | Window-title format string + Wayland CSD titlebar sync (`sync_csd_titlebar`, Linux-only) |
| `src-tauri/tauri.conf.json` | Window, CSP, bundling, file associations (md/markdown/mdown, txt) |
| `src-tauri/capabilities/default.json` | Permissions for the `main` window (core/dialog/opener defaults + close/destroy) |
| `wdio.conf.ts` | WebdriverIO config; onPrepare builds debug app with `VITE_E2E=1` (spawns `tauri build` with `CI=false` — see gotcha), kills orphaned `tauri-driver` on Windows |

## Conventions
- Source colocated tests: every `src/**/__tests__/*.spec.ts` mirrors its module; Rust unit tests are inline `#[cfg(test)]` in each module.
- Styling: CSS custom properties driven by `data-theme`/`data-font`/`data-text-size` attributes (`styles.css`); scoped `<style>` in components; CodeMirror chrome follows the theme too.
- `data-testid` attributes everywhere (`editor-pane`, `preview-pane`, `toolbar-*`, `find-*`, `divider`, `toast`, …) used by Vitest + WDIO.
- Vite test env is jsdom with `src/test-setup.ts` stubbing `getBoundingClientRect`/`getClientRects`.
- Rust lib is named `markdown_editor_lib` (avoids Windows bin/lib name clash, see Cargo.toml comment).
- Strict TS (`strict`, `noUnusedLocals`, `noUnusedParameters`); `vue-tsc --noEmit` gates builds.
- PRD, ADRs, and a numbered slice plan live in `docs/` and are the design source of truth.

## Gotchas & Non-obvious Facts
- **Editor is authoritative**: after New/Open/external reload the workspace must rebuild the editor through the Tab-session controller (`tabSession.runTabSwitch(... after: "rebuild")` or `tabSession.rebuild()`); a rebuild creates a fresh CM state (clears undo history, scrolls to top). The controller, not call order, enforces the protocol.
- **Preserved editor state lives in a WeakMap keyed by Tab records, outside the reactive store** (`tabEditorState.ts`): a Vue reactive proxy around a CodeMirror state breaks CM's strict state-identity checks on dispatch (same reason the view is a `shallowRef`).
- **Section collapse state survives re-renders** by key (`hN:Heading#k`, duplicates disambiguated by occurrence); `sections.ts` is the only home of that DOM contract — don't query `.md-section`/`.md-chevron` with raw selectors elsewhere. The chevron glyph is a real `▸` text node, assertable on `renderMarkdown` output.
- **Prism colors are per-Palette CSS variables**: `prism-theme.css` is one static token stylesheet reading `--syntax-*` vars; each Palette block in `styles.css` declares them (11 vars: comment/punctuation/keyword/literal/property/tag/string/function/class/atrule/url). A new Palette that skips them renders code blocks in the inherited palette's colors.
- **E2E seam**: `VITE_E2E=1` (set by `wdio.conf.ts`) replaces native dialogs with localStorage stubs (`markdownhexer:e2e:guard-choice`, `:external-choice`, `:open-path`, `:save-path`) and installs global triggers (`__triggerWindowClose`, `__triggerExternalCheck`, `__triggerDrop`, `__triggerFileOpen`) in `App.vue` onMounted. The close-guard spec relies on `__triggerWindowClose`; the app does **not** actually destroy on close when `VITE_E2E=1`.
- **Windows E2E**: `tauri-driver` is spawned via a `cmd.exe` shell wrapper that orphidifies the real process; `wdio.conf.ts` force-kills the tree with `taskkill /IM tauri-driver.exe /T /F`.
- **Ambient `CI` env var breaks `tauri build`**: tauri CLI maps `CI` onto its `--ci` flag (accepts true/false), so a bare `CI=1` in the shell fails the e2e build before compilation ("invalid value '1' for '--ci'"). `wdio.conf.ts` onPrepare spawns the build with `env: { ...process.env, CI: "false" }`; if you build manually for e2e, prefix with `CI=false`.
- **Find/replace never works blind**: `FindReplacePanel.vue` owns the gate — every tracked-match change and both replace handlers flow through `withVisibleSource` (Preview Only → Split View first, work deferred until the pane is visible) / `setTrackedMatch` (record + deferred selection dispatch); the panel's `open()` also surfaces the source, so `ui.showSource()` is called from this component alone; `dispatchSelectionToEditor`/`syncSelectionToEditor` mirror the tracked match into the editor.
- CM's own search panel is routed into an **off-screen hidden host** (`EditorPane.vue` `hiddenPanelHost`) purely to activate match highlighting; the visible panel is `FindReplacePanel`.
- BOM handling: open/inspect strip a single leading BOM; save writes clean UTF-8 (no BOM). Same read path means a BOM file is never falsely flagged Externally-Modified.
- Asset protocol is deliberately strict: absolute + canonicalized + inside Document dir; symlinks/`..` that escape are rejected (403).
- Preview images only resolve when the Document has a canonical path; Untitled Documents render without image rewriting.
- Window title is set **twice**: `globalThis.document.title` (webview) and `invoke("set_document_title")` (OS title bar).
- Vite dev server is pinned to port 1420 (`strictPort`), HMR on 1421, and ignores `src-tauri` watch.
- `package.json` uses `allowScripts` for esbuild/edgedriver/geckodriver — on Windows npm may block their postinstall scripts otherwise.
- Divider drag writes raw fractions into the ui store; `roundPercent` avoids float noise in the inline `flexBasis` style.

## Where to Make Changes
- **Editing behavior / new markdown ops** → `src/components/EditorPane.vue`, `src/lib/formatting.ts`, `src/lib/editorFormatting.ts` (+ Toolbar/`onFormat` in `App.vue`).
- **Rendering / sanitization / highlighting** → `src/lib/renderer.ts`, `src/lib/sections.ts` (Section markup), `src/components/PreviewPane.vue`, `src/lib/assetUrl.ts`, `src-tauri/src/asset.rs`.
- **Tab-switch / editor-state preservation** → `src/lib/tabEditorState.ts` (controller + WeakMap), `src/components/EditorPane.vue` (extensions, state creation), `src/App.vue` (the five switch paths).
- **Synced Scrolling / block anchors** → `src/lib/blockMap.ts` (`deriveBlocks`, `SKIP_BLOCK_TOKEN_TYPES`), `src/lib/useSyncedScrolling.ts`.
- **Collapsible Sections** → `src/lib/sections.ts` (DOM contract), `src/components/PreviewPane.vue` (`collapsedSections` record), `CONTEXT.md` (§ Sections).
- **Save/Open/dialog flows or new IPC** → `src/stores/document.ts`, `src/lib/*Dialog.ts`, matching Rust module in `src-tauri/src/` + command registration in `src-tauri/src/lib.rs`.
- **Keyboard shortcuts / window events** → `onKeydown` and `onMounted` listeners in `src/App.vue`.
- **Theme/font/text size/typography** → `src/stores/settings.ts` (types, persistence, `resolvedTheme`), `src/styles.css` (Palette token blocks), `src/prism-theme.css` (`--syntax-*`), `src/components/Toolbar.vue`, `src/lib/shortcuts.ts` (control tooltip entries).
- **Layout / split divider / focus modes** → `src/stores/ui.ts`, `src/App.vue`.
- **Native dialogs / titles / single-instance** → `src-tauri/src/{confirm,external,title,instance}.rs`.
- **New E2E spec** → add `e2e/specs/*.e2e.ts` (needs a `data-testid` hook; uses localStorage stubs for dialogs).
