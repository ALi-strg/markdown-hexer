# Slice 15 — Preview asset handling

**Type:** AFK
**Blocked by:** Slice 03

## Source

docs/PRD.md — User stories 39, 40, 41; Implementation Decisions (File access, Rendering pipeline)

## What to build

The Preview Pane resolves relative image paths in the Document against the Document's directory via a scoped `asset://` custom protocol — directory-scoped, never whole-filesystem. Links in the Preview Pane open in the system browser through Tauri's core `openUrl`. Rendered text in the Preview Pane is selectable and copyable. The strict CSP remains intact (no inline scripts, no remote content).

## Acceptance criteria

- [ ] Relative image paths in the Document render in the Preview Pane resolved against the Document's directory
- [ ] `asset://` rejects paths outside the Document's directory (Rust unit tests assert directory scoping)
- [ ] Links in the Preview Pane open in the system browser
- [ ] Preview Pane text is selectable and copyable
- [ ] E2E: a Document with a relative image and a link renders both correctly

## Blocked by

- [Slice 03 — Live GFM rendering pipeline](03-live-gfm-rendering-pipeline.md)
