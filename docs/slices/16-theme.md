# Slice 16 — Theme

**Type:** AFK
**Blocked by:** Slice 01

## Source

docs/PRD.md — User stories 42, 43, 49; Implementation Decisions (Theme)

## What to build

A three-state Theme preference: **System** (default, follows `prefers-color-scheme` live), **Light**, or **Dark**. A manual override wins until the app restarts. A `data-theme` attribute drives all styling in both panes and the toolbar. The preference is persisted in localStorage and restored on launch.

## Acceptance criteria

- [ ] System mode follows the OS theme live (reacts to OS changes while running)
- [ ] Manual Light or Dark override wins until the app restarts
- [ ] `data-theme` is set to system/light/dark and all styling is keyed off it
- [ ] The preference persists in localStorage across launches
- [ ] E2E: switch themes and assert `data-theme` and pane styling change

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
