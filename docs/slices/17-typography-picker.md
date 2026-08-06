# Slice 17 — Typography picker

**Type:** AFK
**Blocked by:** Slice 01

## Source

docs/PRD.md — User stories 44, 49; Implementation Decisions (Typography)

## What to build

A curated picker of ~4 system font stacks (monospace plus prose serif/sans/mono). One shared choice applies to both the Editor Pane and the Preview Pane. The choice is persisted in localStorage alongside the Theme and restored on launch. No bundled font assets — system stacks only.

## Acceptance criteria

- [ ] The picker offers ~4 curated font stacks
- [ ] The chosen stack applies to both panes
- [ ] The choice persists in localStorage and is restored on launch
- [ ] Vitest: `settings` store persistence contract for the font choice

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
