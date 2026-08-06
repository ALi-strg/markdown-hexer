# Slice 08 — Confirm-Discard Guard

**Type:** AFK
**Blocked by:** Slice 07

## Source

docs/PRD.md — User stories 26, 27; Implementation Decisions (Document model, Feedback surfaces, ADR-0003)

## What to build

The Confirm-Discard Guard is the native dialog shown before any action would discard unsaved changes in a Dirty Document. It offers **Save / Don't Save / Cancel**. Save runs the Save flow (which becomes Save As for an Untitled Document); Don't Save proceeds with the discard; Cancel aborts. A clean Document never shows the guard.

This slice builds the guard as a reusable primitive and wires it to app close. Wiring into New and Open lands with those flows in Slice 09.

## Acceptance criteria

- [ ] Closing the window with a Dirty Document shows the native dialog with Save / Don't Save / Cancel
- [ ] Save runs the Save flow (Save As if untitled); Don't Save closes; Cancel aborts the close
- [ ] Closing a clean Document shows no dialog
- [ ] E2E covers all three decision paths for close
- [ ] Vitest: the guard decision outcomes map to the correct document-store transitions

## Blocked by

- [Slice 07 — Save / Save As](07-save-save-as.md)
