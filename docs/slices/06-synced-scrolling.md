# Slice 06 — Synced Scrolling

**Type:** AFK
**Blocked by:** Slices 03, 05

## Source

docs/PRD.md — User story 6; Implementation Decisions (Synced Scrolling)

## What to build

One-way, block-anchored Synced Scrolling: scrolling the Editor Pane scrolls the Preview Pane to the corresponding block. The CodeMirror visible line range is mapped through the `marked` tokens to the rendered blocks in the Preview Pane; the mapping is recomputed on every render. It is active only in Split View and is never proportional — the Preview Pane always lands on the block corresponding to the editor's visible region, even when source and rendered heights drift.

## Acceptance criteria

- [ ] Scrolling the Editor Pane scrolls the Preview Pane to the corresponding block
- [ ] Synced Scrolling is active only in Split View (inactive in Preview Only and Focus Mode)
- [ ] Pure-function tests for the editor-block → preview-block mapping across representative token streams, including source-vs-rendered height drift
- [ ] E2E: scroll the Editor Pane, assert the Preview Pane lands on the matching block

## Blocked by

- [Slice 03 — Live GFM rendering pipeline](03-live-gfm-rendering-pipeline.md)
- [Slice 05 — Layout modes](05-layout-modes.md)
