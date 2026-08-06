# Slice 10 — Externally-Modified detection

**Type:** AFK
**Blocked by:** Slices 07, 09

## Source

docs/PRD.md — User stories 28, 29, 30; Implementation Decisions (Externally-Modified detection)

## What to build

On window focus, the app compares the on-disk mtime/content against when the Document was loaded or last saved. If the file changed and the Document is **clean**, it reloads silently — the user always sees the latest version. If the file changed and the Document is **Dirty**, a native **Reload / Overwrite / Cancel** dialog decides which version wins: Reload replaces the Document with the on-disk content, Overwrite writes the current Document over the disk, Cancel keeps the current state untouched.

## Acceptance criteria

- [ ] On focus, a clean Document whose file changed on disk reloads silently (no dialog, no Dirty)
- [ ] On focus, a Dirty Document whose file changed on disk shows Reload / Overwrite / Cancel
- [ ] Reload replaces content; Overwrite writes current content to disk and stays Dirty until saved; Cancel keeps current state
- [ ] Vitest: the externally-modified decision outcomes in the `document` store
- [ ] E2E: all three decision paths against a real changed file

## Blocked by

- [Slice 07 — Save / Save As](07-save-save-as.md)
- [Slice 09 — New & Open flows](09-new-open-flows.md)
