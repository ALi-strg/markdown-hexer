# Slice 03 — Live GFM rendering pipeline

**Type:** AFK
**Blocked by:** Slice 01

## Source

docs/PRD.md — User stories 3, 4, 45; Implementation Decisions (Rendering pipeline, ADR-0002)

## What to build

The Preview Pane renders the current Document live. The pipeline is `marked` with GFM extensions (tables, strikethrough, task lists, autolinks) → DOMPurify sanitization → DOM insertion. A strict CSP applies; no inline scripts, no remote content. Re-rendering is debounced with cancel-and-delay at ~200ms so long Documents stay smooth while typing.

The renderer runs as a pure function so the pipeline can be unit-tested: assert GFM features render, assert sanitized output, assert no script execution.

## Acceptance criteria

- [ ] Preview Pane renders the Document live while typing
- [ ] GFM renders: tables, strikethrough, task lists, autolinks
- [ ] Debounced full re-render at ~200ms with cancel-and-delay on rapid input
- [ ] Sanitized output: `<script>` tags and event-handler attributes stripped; no script execution (pure-function test)
- [ ] Pure-function tests cover GFM + sanitization for representative inputs
- [ ] E2E: typing markdown updates the Preview Pane

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
