# Markdown-Magic — v1 PRD

## Problem Statement

Writing Markdown on a desktop often means a cluttered, browser-based tool or a heavy IDE. The user wants a distraction-free, native Markdown editor that renders a live preview while they type, works with their real file folders on disk, and respects their OS — a premium desktop feel without the friction of a web app in a browser tab.

## Solution

Markdown-Magic is a cross-platform Tauri 2 desktop app. A single window opens one Document at a time, with a CodeMirror 6 Editor Pane and a live-rendered Preview Pane. It reads and writes real files through native dialogs, shows a dirty asterisk in the OS title bar, and protects unsaved work with a Confirm-Discard Guard. Layout modes (Split View, Preview Only, Focus Mode) let the user read, write, or do both; the Theme follows the OS with an optional manual override.

## User Stories

1. As a Markdown author, I want to launch the app and land in a blank Untitled Document in Split View, so that I can start writing immediately.
2. As a Markdown author, I want the Editor Pane on the left to render my Markdown source as I type, so that editing feels immediate and native.
3. As a Markdown author, I want the Preview Pane on the right to update live as I type, so that I can see the rendered result without switching views.
4. As a Markdown author, I want my Markdown rendered as GitHub-Flavored Markdown (tables, strikethrough, task lists, autolinks), so that the preview matches what my audience sees on GitHub.
5. As a Markdown author, I want code blocks in the preview syntax-highlighted, so that fenced code is readable at a glance.
6. As a Markdown author, I want scrolling the Editor Pane to scroll the Preview Pane to the corresponding block, so that I always see the rendering of what I'm editing.
7. As a Markdown author, I want a Split View mode as the default for new Documents, so that I can write and preview simultaneously.
8. As a Markdown author, I want a Preview Only mode, so that I can read the rendered Document undistracted by the source.
9. As a Markdown author, I want a Focus Mode, so that I can write with only the source visible.
10. As a Markdown author, I want to cycle between layout modes with a keyboard shortcut, so that I never have to reach for the mouse.
11. As a Markdown author, I want the layout mode auto-chosen for me (Split View for New, Preview Only for Open), so that the app adapts to what I'm doing without me asking.
12. As a Markdown author, I want my manual layout-mode toggle to stick until the next Document loads, so that the app doesn't fight my preferences.
13. As a Markdown author, I want to open a `.md` file from disk via a native dialog, so that I can edit my existing files.
14. As a Markdown author, I want the Open dialog filtered to Markdown-family files (and `.txt`), so that I find the right files quickly.
15. As a Markdown author, I want to drag a `.md` file onto the window to open it, so that opening a file is one gesture.
16. As a Markdown author, I want to double-click a `.md` file in the OS file manager to open it in the app, so that Markdown files are associated with the app.
17. As a Markdown author, I want double-clicking a `.md` file while the app is already running to open that file in the existing window, so that I don't get duplicate windows.
18. As a Markdown author, I want to create a new Untitled Document with `Cmd/Ctrl+N`, so that I can start a fresh note.
19. As a Markdown author, I want my Untitled Document titled `Untitled.md` in the window title, so that I know it has no file on disk yet.
20. As a Markdown author, I want `Cmd/Ctrl+S` to Save my Document, so that my work is written to disk.
21. As a Markdown author, I want Save on an Untitled Document to behave as Save As, so that an untitled note gets a real path on first save.
22. As a Markdown author, I want `Cmd/Ctrl+Shift+S` to Save As, so that I can write the Document to a new path.
23. As a Markdown author, I want Save As to make the chosen path the Document's canonical path, so that subsequent Saves write there and the title updates.
24. As a Markdown author, I want the window title to show an asterisk after the filename when the Document is Dirty, so that I always know unsaved work exists.
25. As a Markdown author, I want the asterisk to clear when the Document is saved, so that I know my work is safely on disk.
26. As a Markdown author, I want a Confirm-Discard Guard before New, Open, or app close discards unsaved changes, so that I can't lose work by accident.
27. As a Markdown author, I want the Confirm-Discard Guard to offer Save / Don't Save / Cancel, so that I choose what happens to my unsaved work.
28. As a Markdown author, I want the app to detect when my open file changed on disk, so that I don't silently overwrite someone else's changes.
29. As a Markdown author, I want to choose Reload / Overwrite / Cancel when the file on disk changed and my Document is Dirty, so that I decide which version wins.
30. As a Markdown author, I want the app to reload silently when the file changed on disk and my Document is clean, so that I always see the latest version.
31. As a Markdown author, I want a toolbar with Bold, Italic, Heading, List, Link, and Code buttons, so that I can format without remembering syntax.
32. As a Markdown author, I want toolbar formatting to wrap my selection in the right Markdown syntax, so that my source stays valid.
33. As a Markdown author, I want `Cmd/Ctrl+B` and `Cmd/Ctrl+I` shortcuts, so that formatting is keyboard-driven.
34. As a Markdown author, I want formatting buttons hidden in Preview Only mode, so that I don't see buttons that can't apply to a hidden Editor Pane.
35. As a Markdown author, I want `Cmd/Ctrl+F` find and replace in the Document, so that I can navigate and edit long files.
36. As a Markdown author, I want find to work while staying in Preview Only until I actually replace, so that I can search a rendered read.
37. As a Markdown author, I want the app to switch to a source-visible mode when I perform a replace while in Preview Only, so that I never edit hidden text.
38. As a Markdown author, I want full undo/redo history that survives toolbar formatting, so that I can reverse any edit.
39. As a Markdown author, I want relative image paths in my Document to render in the Preview Pane, so that real Markdown folders work.
40. As a Markdown author, I want links in the Preview Pane to open in the system browser, so that I can follow references.
41. As a Markdown author, I want rendered text in the Preview Pane selectable and copyable, so that I can quote the rendered output.
42. As a Markdown author, I want the app to follow my OS Light/Dark theme by default, so that it always feels native.
43. As a Markdown author, I want a manual Light or Dark override, so that I can fix a preference the OS doesn't share.
44. As a Markdown author, I want a small set of curated fonts to choose from for both panes, so that the text looks the way I like.
45. As a Markdown author, I want the preview to keep up with my typing without stuttering on long Documents, so that live rendering feels smooth.
46. As a Markdown author, I want save failures to show me an error and keep my Document Dirty, so that I know my work is not safe.
47. As a Markdown author, I want the window title to read `<filename> — Markdown-Magic`, so that the app is identifiable and the Document is clear.
48. As a Markdown author, I want a resizable split with a remembered divider position in Split View, so that I can balance the two panes.
49. As a Markdown author, I want my theme and font preferences remembered between launches, so that I don't reconfigure the app.
50. As a Markdown author, I want to open files with or without a BOM and have them saved back cleanly as UTF-8, so that Notepad-era files render correctly.
51. As a Markdown author, I want a Layout Switcher in the toolbar with Split / Preview / Focus segments, so that I can switch Layout Modes with one click and always see which mode is active.

## Implementation Decisions

- **Framework**: Tauri 2 (stable), Vite, Vue 3 Composition API. In Vue component files, the `<template>` block comes first, then `<script>`, then `<style>`.
- **State management**: Pinia split into three stores — `document` (the Document's content, canonical path, Dirty flag; single source of truth for content), `ui` (Layout Mode, divider position, find-overlay state; reset per launch), and `settings` (Theme + font choice, persisted in localStorage).
- **Editor engine**: CodeMirror 6. CodeMirror is authoritative for edits; the `document` store mirrors text via an `updateListener` and is never written back into the editor. (ADR-0001)
- **Rendering pipeline**: `marked` with GFM extensions → DOMPurify sanitization → DOM insertion. Prism highlighting wired through `marked`'s code renderer (`marked-highlight`), one pass at render time. Strict CSP in the Tauri config; no inline scripts, no remote content. (ADR-0002)
- **Prism scope**: ~12 curated languages (markup, css, clike, javascript, typescript, python, json, yaml, bash, sql, java, go, markdown); two hand-tuned Prism themes (dark/light) driven by the `data-theme` attribute.
- **Document model**: Single-Document in memory at any time. New/Open swap the Document; the Confirm-Discard Guard protects unsaved work. No autosave. (ADR-0003)
- **Save semantics**: Save on an Untitled Document behaves as Save As. Save As sets the canonical path and updates the title. Dirty clears only on successful write. Save failures keep the Document Dirty and surface a toast.
- **Layout Modes**: Split View (both panes, Synced Scrolling active), Preview Only (Editor hidden), Focus Mode (Preview hidden). Auto-chosen on Document load: Open → Preview Only, New → Split View. A Layout Switcher segmented control (Split / Preview / Focus) in the toolbar and the `Cmd/Ctrl+Shift+P` shortcut set the mode directly; the user's manual selection is authoritative until the next Document load; Save As does not change the mode; modes not persisted.
- **Synced Scrolling**: one-way (Editor → Preview), block-anchored via the CodeMirror visible line range mapped through `marked` tokens to rendered blocks; recomputed on render. Never proportional. Only in Split View.
- **Window chrome**: native OS title bar. `window.setTitle` drives `<filename> * — Markdown-Magic`. The "premium" look comes from the in-app toolbar, panes, and typography, not custom window frames.
- **Theme**: three-state preference — System (default, follows `prefers-color-scheme` live), Light, Dark. Manual override wins until restart. `data-theme` attribute drives all styling. Persisted in localStorage. Light is a warm beige and Dark a deep navy; a shared token set drives the app chrome, the CodeMirror Editor Pane, and the Preview Pane typography. Native controls (select popups, scrollbars) get their palette via `color-scheme`.
- **Typography**: curated picker of ~4 system font stacks (monospace + prose serif/sans/mono), one shared choice for both panes. Persisted in localStorage alongside Theme.
- **File access**: Open dialog filtered to `.md`/`.markdown`/`.mdown`/`.txt` as a convenience, not a lock. Drag-and-drop opens files through the same Open flow (with Confirm-Discard Guard). Relative paths in the Document resolve against its directory via a scoped `asset://` custom protocol (directory-scoped, never whole-filesystem). Links open in the system browser via Tauri core `openUrl`. The `@tauri-apps/plugin-shell` plugin is dropped from the stack.
- **File association + single-instance**: the app registers as a Markdown handler per-OS; a second launch forwards the requested path to the running instance, which runs the normal Open flow in the existing window.
- **Encoding**: always UTF-8; strip a leading BOM on read; write without BOM. Non-UTF-8 files surface the error surface rather than being mangled.
- **Externally-Modified detection**: on window focus, compare on-disk mtime/content against load/save time. Dirty → Reload / Overwrite / Cancel dialog; clean → silent reload.
- **Find/replace**: `@codemirror/search` with replace. Find works in all Layout Modes; a replace in Preview Only switches to a source-visible mode first.
- **Live Rendering**: debounced full re-render, cancel-and-delay at ~200ms. Synced Scrolling mapping recomputed on each render.
- **Toolbar**: Bold (`**`), Italic (`*`), Heading (`# ` prefix), List (`- ` prefix), Link (`[text](url)`), Code (inline `` ` `` or fenced). Formatting buttons hidden in Preview Only; Bold/Italic work on a collapsed cursor.
- **Feedback surfaces**: native dialogs for decisions (Confirm-Discard Guard, Externally-Modified); auto-dismissing toasts for transient errors (save/open failure). No status bar; the Dirty asterisk is the persistent indicator.
- **Keyboard map**: `Cmd/Ctrl+S` Save, `Cmd/Ctrl+Shift+S` Save As, `Cmd/Ctrl+O` Open, `Cmd/Ctrl+N` New, `Cmd/Ctrl+Shift+P` cycle layout mode, `Cmd/Ctrl+B` Bold, `Cmd/Ctrl+I` Italic, `Cmd/Ctrl+F` Find, `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` undo/redo.
- **Window**: initial 1200×800 centered; minimum 800×600. Open/Save As dialogs start at the last-used directory, or the current Document's directory when it has one.
- **Packaging**: CI (GitHub Actions) builds all three platforms on push/tag; local dev targets the host OS. Full icon set generated from a single source design. No updater, system tray, deep-link, or MSIX/App Store signing in v1.

## Testing Decisions

- **What makes a good test**: test external behavior through the highest seam available, never implementation details. A test should fail only if the user-visible behavior breaks.
- **Prior art**: none — greenfield repository. The following seams are proposed from the start.

Proposed seams (highest-first):

1. **E2E (WebdriverIO + Tauri driver / Playwright for Tauri)** — highest seam: the full app. Covers the cross-cutting user flows that no unit test can: opening/saving files through the real dialog surface (stubbed), Confirm-Discard Guard decision paths, drag-drop and file-association open, Externally-Modified Reload/Overwrite/Cancel, layout-mode cycling, find/replace switching modes, and the window-title format with the Dirty asterisk.
2. **Rust unit tests (`cargo test`)** — for backend behavior: BOM strip/write, directory scoping of the asset protocol (must reject paths outside the Document's directory), and `setTitle` / `openUrl` command behavior.
3. **Frontend unit tests (Vitest + Vue Test Utils)** — for the Pinia stores as behavior contracts: `document` store transitions (Dirty set/cleared, Save-As-changes-path, untitled-Save-as-Save-As, externally-modified decision outcomes), and `ui` store layout-mode state machine (auto-choice on load, manual override wins, no persistence).
4. **Pure-function tests (Vitest)** — for the rendering pipeline and Synced Scrolling mapping: GFM + sanitization output (assert sanitized, assert no script execution), code-fence highlighting, and the editor-block→preview-block mapping function given representative token streams (including the drift between source and rendered heights).

## Out of Scope

- Multiple Documents open at once (tabs / multi-window document editing).
- Bidirectional (preview→editor) synced scrolling.
- Autosave and crash-recovery of unsaved Documents.
- In-app navigation into linked local `.md` files (links open in the system browser only).
- Custom in-app window title bar / glassmorphism on the window frame.
- Application updater, system tray, deep links, auto-launch.
- MSIX / App Store / macOS notarization and code signing for distribution.
- Non-UTF-8 file encodings (UTF-16, Latin-1).
- Word count, status bar, outline, image click-to-zoom.
- Bundled font assets (system font stacks only).
- Full Prism language set (curated ~12 languages).
- Keyboard shortcut customization UI.

## Further Notes

- Product name is **Markdown-Magic**; the repo slug is `markdown-editor`. The window title reads `<filename> * — Markdown-Magic`.
- Domain vocabulary lives in `CONTEXT.md` at the repo root; use it in all code, docs, and issues. Key terms: Editor Pane, Preview Pane, Synced Scrolling, Document, Confirm-Discard Guard, Dirty, Save, Save As, Split View, Preview Only, Focus Mode, Theme, Untitled Document, Externally-Modified.
- Architectural decisions are recorded in `docs/adr/` (0001 CodeMirror engine, 0002 sanitized pipeline, 0003 single-document model). New decisions meeting the ADR bar should be recorded there.
- The idea document (`docs/idea.md`) remains the seed; this PRD supersedes it for v1 scope.
