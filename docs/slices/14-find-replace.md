# Slice 14 — Find & replace

**Type:** AFK
**Blocked by:** Slices 02, 05

## Source

docs/PRD.md — User stories 35, 36, 37; Implementation Decisions (Find/replace, Keyboard map)

## What to build

Cmd/Ctrl+F opens find & replace via `@codemirror/search`, working in all Layout Modes. Find works even in Preview Only — the user can search a rendered read. A replace while in Preview Only first switches to a source-visible mode (Split View), so the user never edits hidden text, and then performs the replace. Replacing in a source-visible mode happens in place.

## Acceptance criteria

- [ ] Cmd/Ctrl+F opens find; matches are highlighted and navigable in all modes
- [ ] Find stays available in Preview Only until a replace is attempted
- [ ] Replace in Preview Only switches to Split View first, then replaces
- [ ] Replace in a source-visible mode replaces in place
- [ ] E2E: find, next/previous, and replace including the Preview Only → Split View switch

## Blocked by

- [Slice 02 — Editing core, Dirty state, undo/redo](02-editing-core-dirty-undo-redo.md)
- [Slice 05 — Layout modes](05-layout-modes.md)
