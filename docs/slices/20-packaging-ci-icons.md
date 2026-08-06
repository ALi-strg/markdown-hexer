# Slice 20 — Packaging, CI & icons

**Type:** AFK (placeholder icon design acceptable)
**Blocked by:** Slice 01

## Source

docs/PRD.md — Implementation Decisions (Packaging, Window)

## What to build

GitHub Actions CI builds the app for Windows, macOS, and Linux on push and tag. Local dev targets the host OS. A full icon set is generated from a single source design; a placeholder design is acceptable for this slice. The bundle configuration includes the OS-level file-association registration from Slice 12. No updater, system tray, deep links, MSIX/App Store signing, or notarization in v1.

## Acceptance criteria

- [ ] CI runs and is green for all three platforms on push and tag
- [ ] A distributable bundle/installer is produced per platform
- [ ] The generated icon set is used across the bundles
- [ ] File-association registration is present in the produced bundles

## Blocked by

- [Slice 01 — App scaffold tracer bullet](01-app-scaffold.md)
