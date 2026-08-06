# Slice 12 — File association + single-instance

**Type:** AFK
**Blocked by:** Slice 09

## Source

docs/PRD.md — User stories 16, 17; Implementation Decisions (File association + single-instance, Window)

## What to build

The app registers as a Markdown handler per OS (bundle/file-association configuration for Windows, macOS, Linux). Double-clicking a `.md` file in the OS file manager opens it in the app. If the app is already running, a second launch (e.g. double-clicking another file) forwards the requested path to the running instance, which runs the normal Open flow in the existing window — no duplicate windows, no separate Document.

## Acceptance criteria

- [ ] Double-clicking a `.md` file in the OS file manager opens the app with that Document
- [ ] Double-clicking a `.md` file while the app is running opens it in the existing window via the Open flow (guard included when Dirty)
- [ ] A second launch never creates a second window
- [ ] OS-level registration is declared in the bundle configuration for all three platforms

## Blocked by

- [Slice 09 — New & Open flows](09-new-open-flows.md)
