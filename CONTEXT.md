# Markdown Editor

A cross-platform Tauri 2 desktop app: a distraction-free Markdown editor with a live rendered preview and native file-system integration.

## Language

**Editor Pane**:
The left-hand panel containing the Markdown source, built on CodeMirror 6.
_Avoid_: Editor, code editor, text area

**Preview Pane**:
The right-hand panel showing the rendered HTML output of the current document.
_Avoid_: Preview, rendered view

**Synced Scrolling**:
The editor-driven behavior where scrolling the Editor Pane scrolls the Preview Pane to the corresponding block. One-way (editor → preview) and block-anchored, never proportional.
_Avoid_: Scroll sync, synchronized scrollbars

**Document**:
The Markdown file currently being edited, plus its in-memory unsaved changes.
_Avoid_: File, note, buffer

**Confirm-Discard Guard**:
The native dialog shown before `New`, `Open`, or app close when the current Document has unsaved changes. Offers Save / Don't Save / Cancel.
_Avoid_: Save prompt, unsaved-changes dialog

**Dirty**:
The state of a Document whose content differs from what's on disk, shown as an asterisk (*) in the window title.
_Avoid_: Modified, unsaved, needs-saving

**Save**:
Write the current Document to disk. For an untitled Document, Save becomes Save As. Clears the Dirty state on success.
_Avoid_: Save File, write to disk

**Save As**:
Write the current Document to a user-chosen path, which then becomes the Document's canonical path. The title updates to the new filename.
_Avoid_: Save copy, export

## Layout Modes

**Split View**:
The default layout with both panes visible side by side. Chosen automatically when a New Document is created. The only mode in which Synced Scrolling is active.
_Avoid_: Split screen, side-by-side

**Preview Only**:
The layout with the Editor Pane hidden and the Preview Pane filling the window. Chosen automatically when an existing file is opened. No Synced Scrolling in this mode.
_Avoid_: Reading mode, view mode

**Focus Mode**:
The layout with the Preview Pane hidden and the Editor Pane filling the window.
_Avoid_: Writing mode, Zen mode

**Layout Switcher**:
The toolbar segmented control (Split / Preview / Focus) that sets the Layout Mode directly. Always visible and enabled in every Layout Mode — it is the way out of Preview Only. A selection behaves as a manual toggle: authoritative until the next Document load. The keyboard shortcut Cmd/Ctrl+Shift+P cycles the same modes.
_Avoid_: View toggle, mode selector, segmented buttons

**Formatting Buttons**:
The toolbar's Bold, Italic, Heading, List, Link, and Code controls. Visible in Split View and Focus Mode; hidden in Preview Only, where there is no Editor Pane to format. The Bold/Italic keyboard shortcuts no-op in Preview Only.
_Avoid_: Edit buttons, markup buttons

The auto-chosen layout mode applies only when a Document is loaded (Open → Preview Only, New → Split View); the user's manual toggle is authoritative until the next Document load, and Save As does not change the layout mode. Modes are not persisted across launches.

## Appearance

**Theme**:
The app's color scheme. A three-state preference: System (default, follows the OS live), Light, or Dark. A manual override wins until the app restarts. Persisted in localStorage.
_Avoid_: Color mode, dark mode toggle

## File Lifecycle

**Untitled Document**:
A Document created by `New` or at first launch that has no canonical path. Its window title reads `Untitled.md`; Save behaves as Save As until it gains a path.
_Avoid_: New file, nameless file

**Externally-Modified**:
The state where the file on disk changed (mtime or content) since the Document was loaded or last saved. Detected on window focus. If the Document is Dirty the user chooses Reload / Overwrite / Cancel; if clean it reloads silently.
_Avoid_: File changed, stale file

## Window Title

The window title reads `<filename> — Markdown-Magic`, with `*` inserted after the filename when the Document is Dirty (e.g., `notes.md * — Markdown-Magic`). Untitled Documents read `Untitled.md — Markdown-Magic`. The product name is **Markdown-Magic**.
_Avoid_: markdown-editor (the repo slug), Markdown Editor
