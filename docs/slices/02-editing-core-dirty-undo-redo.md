# Slice 02 — Editing core, Dirty state, undo/redo

**Type:** AFK
**Blocked by:** Slice 01

## Source

docs/PRD.md — User stories 2, 19, 24, 38; Implementation Decisions (State management, Editor engine, ADR-0001)

## What to build

CodeMirror 6 becomes the authoritative editor. The `document` store mirrors the text via an `updateListener` and is never written back into the editor (ADR-0001) — no feedback loops. Typing in the Editor Pane sets the Document Dirty; the window title inserts `*` after the filename (e.g. `Untitled.md * — Markdown Hexer`) and removes it when the Document is clean. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z provide undo/redo through CodeMirror's native history, so any edit can be reversed.

The Dirty asterisk clearing on Save belongs to Slice 07; here the Dirty state and title update are testable through the store and E2E.

## Acceptance criteria

- [ ] Typing in the Editor Pane updates the `document` store text; the store is never written into the editor (no update loops)
- [ ] First keystroke sets Dirty; the title shows `*` after the filename while Dirty
- [ ] Window title is restored when the Document becomes clean
- [ ] Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z undo/redo typing
- [ ] Vitest contract tests for the `document` store: Dirty set/cleared on the right transitions
- [ ] E2E: type in the Editor Pane, assert the asterisk appears; undo, assert text reverts

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
