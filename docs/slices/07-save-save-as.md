# Slice 07 — Save / Save As

**Type:** AFK
**Blocked by:** Slice 02

## Source

docs/PRD.md — User stories 20, 21, 22, 23, 25, 46, 47; Implementation Decisions (Save semantics, Feedback surfaces, Window, Keyboard map)

## What to build

Cmd/Ctrl+S Save writes the Document to disk. On an Untitled Document, Save behaves as Save As (native dialog). Cmd/Ctrl+Shift+S Save As lets the user pick a path, which becomes the Document's canonical path: subsequent Saves write there and the window title updates to the new filename. The Dirty asterisk clears only on a successful write; a failed save keeps the Document Dirty and surfaces an auto-dismissing toast. Open/Save As dialogs start at the last-used directory, or the current Document's directory when it has one.

## Acceptance criteria

- [ ] Cmd/Ctrl+S on a titled Document writes the current content to its canonical path and clears the asterisk
- [ ] Cmd/Ctrl+S on an Untitled Document opens the Save As dialog (via Tauri save dialog), then behaves as a normal Save
- [ ] Cmd/Ctrl+Shift+S Save As: chosen path becomes canonical, title updates to the new filename, asterisk clears
- [ ] Failed save keeps the Document Dirty and shows an auto-dismissing toast
- [ ] E2E: Save to a temp file, assert the file content, title, and asterisk clearing
- [ ] Rust unit tests for the save/setTitle command behavior

## Blocked by

- [Slice 02 — Editing core, Dirty state, undo/redo](02-editing-core-dirty-undo-redo.md)
