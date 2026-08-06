# Slice 18 — Resizable split & divider position

**Type:** AFK (pending a decision — see note)
**Blocked by:** Slice 05

## Source

docs/PRD.md — User story 48; Implementation Decisions (State management, Layout Modes)

## What to build

A draggable divider in Split View lets the user balance the two panes. The divider position is tracked in the `ui` store and remembered across Layout Mode switches within a session, so a Preview Only read and back preserves the balance.

Note on semantics: story 48 says "remembered divider position", while the Implementation Decisions say the `ui` store resets per launch. This slice treats "remembered" as within-session (kept across mode switches, reset on launch). Confirm this reading with the product owner before starting — if divider position should survive launches, it moves to the `settings` store and this slice's acceptance criteria change.

## Acceptance criteria

- [ ] The divider in Split View is draggable and both panes resize
- [ ] The divider position is preserved when switching away from and back to Split View within a session
- [ ] The position resets on launch
- [ ] E2E: drag the divider, cycle modes, return to Split View and assert the position held

## Blocked by

- [Slice 05 — Layout modes](05-layout-modes.md)
