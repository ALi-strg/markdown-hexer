# Slice 09 — New & Open flows

**Type:** AFK
**Blocked by:** Slices 07, 08

## Source

docs/PRD.md — User stories 11, 13, 14, 18; Implementation Decisions (Document model, File access, Window)

## What to build

Cmd/Ctrl+N creates a new Untitled Document. Cmd/Ctrl+O opens a native dialog filtered to `.md`/`.markdown`/`.mdown`/`.txt` as a convenience, not a lock. Opening swaps the current Document for the chosen file, updates the window title to the filename, and — because a swap can discard work — runs the Confirm-Discard Guard first when the current Document is Dirty.

This slice also implements the auto-chosen Layout Mode rule: Open → Preview Only, New → Split View, applied only on Document load.

## Acceptance criteria

- [ ] Cmd/Ctrl+N creates an Untitled Document titled `Untitled.md` in Split View
- [ ] Cmd/Ctrl+O opens the native dialog filtered to the Markdown family plus `.txt`; other files remain selectable
- [ ] Opening a file swaps the Document, loads its content, updates the title, and switches to Preview Only
- [ ] A Dirty current Document triggers the Confirm-Discard Guard before the swap (Save / Don't Save / Cancel)
- [ ] Vitest: document store swap transitions and the `ui` store auto-choice rule
- [ ] E2E: New and Open flows including the guarded swap

## Blocked by

- [Slice 07 — Save / Save As](07-save-save-as.md)
- [Slice 08 — Confirm-Discard Guard](08-confirm-discard-guard.md)
