# Slice 13 — Toolbar & formatting shortcuts

**Type:** AFK
**Blocked by:** Slices 02, 05

## Source

docs/PRD.md — User stories 31, 32, 33, 34, 38; Implementation Decisions (Toolbar, Keyboard map)

## What to build

A toolbar with Bold (`**`), Italic (`*`), Heading (`# ` prefix), List (`- ` prefix), Link (`[text](url)`), and Code (inline `` ` `` or fenced) buttons. Each button wraps the selection in the correct Markdown syntax so the source stays valid; Bold/Italic also work on a collapsed cursor. Cmd/Ctrl+B and Cmd/Ctrl+I mirror the Bold/Italic buttons. Formatting buttons are disabled in Preview Only (no Editor Pane to apply to). All formatting dispatches through CodeMirror so it participates in the normal undo/redo history.

## Acceptance criteria

- [ ] Each toolbar button wraps the selection in the correct syntax (or inserts for a collapsed cursor)
- [ ] Cmd/Ctrl+B and Cmd/Ctrl+I apply Bold/Italic, including on a collapsed cursor
- [ ] Toolbar buttons are disabled in Preview Only and enabled in source-visible modes
- [ ] Formatting is reversible via Cmd/Ctrl+Z (it survives as part of the undo history)
- [ ] E2E: format via toolbar and shortcut, assert the source text and undo behavior

## Blocked by

- [Slice 02 — Editing core, Dirty state, undo/redo](02-editing-core-dirty-undo-redo.md)
- [Slice 05 — Layout modes](05-layout-modes.md)
