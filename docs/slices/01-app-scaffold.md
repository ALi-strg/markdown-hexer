# Slice 01 — App scaffold tracer bullet

**Type:** AFK
**Blocked by:** None — can start immediately

## Source

docs/PRD.md — Solution, Implementation Decisions (Framework, Window, Packaging), Testing Decisions

## What to build

Greenfield tracer bullet that proves the whole toolchain end-to-end: Tauri 2 (stable) + Vite + Vue 3 Composition API (in SFCs, the `<template>` block comes first, then `<script>`, then `<style>`). Pinia is scaffolded with three stores — `document` (content, canonical path, Dirty), `ui` (Layout Mode, divider position, find-overlay state), `settings` (Theme + font) — with no behavior yet.

Launching the app lands on a blank Untitled Document in Split View: an empty CodeMirror 6 Editor Pane on the left and an empty Preview Pane on the right. The native OS title bar reads `Untitled.md — ALi-md-editor` with no asterisk. The window opens 1200×800 centered with a minimum of 800×600. A `data-theme` attribute (default System) drives base styling.

Test runners are wired from day one: `cargo test`, a Vitest runner, and one WebdriverIO/Tauri-driver (or Playwright-for-Tauri) E2E smoke test that asserts the title and both panes.

## Acceptance criteria

- [ ] Dev command launches a window 1200×800 centered, minimum 800×600, native OS title bar
- [ ] A blank Untitled Document appears in Split View with an empty Editor Pane and an empty Preview Pane
- [ ] Title bar reads `Untitled.md — ALi-md-editor` (no asterisk)
- [ ] Three Pinia stores scaffolded; `ui` defaults to Split View
- [ ] `data-theme="system"` present and drives base styling
- [ ] `cargo test` and the Vitest runner are green (even with trivial tests)
- [ ] An E2E smoke test opens the app and asserts the title and both panes

## Blocked by

None — can start immediately
