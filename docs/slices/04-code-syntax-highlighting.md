# Slice 04 — Code syntax highlighting

**Type:** AFK
**Blocked by:** Slice 03

## Source

docs/PRD.md — User story 5; Implementation Decisions (Prism scope)

## What to build

Fenced code blocks in the Preview Pane get syntax highlighting through Prism, wired via `marked-highlight` into the existing render pass (one pass at render time, no post-processing). The language set is the curated ~12: markup, css, clike, javascript, typescript, python, json, yaml, bash, sql, java, go, markdown. Two hand-tuned Prism themes (dark/light) are driven by the `data-theme` attribute.

## Acceptance criteria

- [ ] Fenced code blocks are highlighted for the curated ~12 languages
- [ ] Highlighting happens within the same render pass (not a second pass)
- [ ] Highlight theme follows `data-theme` (dark/light variants both correct)
- [ ] Pure-function test: fenced code output carries Prism classes and is still sanitized
- [ ] E2E: a fenced block in the Document renders highlighted

## Blocked by

- [Slice 03 — Live GFM rendering pipeline](03-live-gfm-rendering-pipeline.md)
