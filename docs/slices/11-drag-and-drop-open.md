# Slice 11 — Drag-and-drop open

**Type:** AFK
**Blocked by:** Slice 09

## Source

docs/PRD.md — User story 15; Implementation Decisions (File access)

## What to build

Dragging a `.md` file onto the window opens it through the same Open flow as the native dialog: the Document is swapped, the Confirm-Discard Guard runs first when the current Document is Dirty, the title updates, and the auto-chosen Layout Mode applies (Preview Only). One gesture, one code path.

## Acceptance criteria

- [ ] Dropping a `.md` file on the window opens it (content, title, Preview Only)
- [ ] Dropping onto a Dirty Document runs the Confirm-Discard Guard before the swap
- [ ] E2E: drop event opens the file through the Open flow

## Blocked by

- [Slice 09 — New & Open flows](09-new-open-flows.md)
