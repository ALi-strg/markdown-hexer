# Slice 05 — Layout modes

**Type:** AFK
**Blocked by:** Slice 01

## Source

docs/PRD.md — User stories 7, 8, 9, 10, 12; Implementation Decisions (Layout Modes)

## What to build

Three Layout Modes, managed by the `ui` store: **Split View** (both panes side by side, default), **Preview Only** (Editor Pane hidden, Preview Pane fills the window), **Focus Mode** (Preview Pane hidden, Editor Pane fills the window). Cmd/Ctrl+Shift+P cycles through the modes. The user's manual toggle is authoritative until the next Document load (a state-machine rule) and modes are not persisted across launches.

The auto-choice on Document load (Open → Preview Only, New → Split View) lands with the New/Open flows in Slice 09; this slice builds the three modes, the cycle shortcut, and the manual-override state machine it plugs into.

## Acceptance criteria

- [ ] Split View, Preview Only, and Focus Mode all switchable and render the correct panes
- [ ] Cmd/Ctrl+Shift+P cycles the modes
- [ ] Manual override state machine: a manual toggle wins until the next Document load; modes not persisted across launches
- [ ] Vitest contract tests for the `ui` store mode transitions
- [ ] E2E: cycle modes and assert panes show/hide

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
