# 06 — Save As collision guard

**What to build:** Save As to a path that is already open in another Tab is refused with a message, keeping the one-Tab-per-path invariant unbroken. Save As to a free path succeeds and updates that Document's Tab label and the window title as today.

**Blocked by:** 02

**Status:** resolved

- [x] Save As to a path open in another Tab is refused and shows a message; the Untitled Document keeps its pathless state
- [x] Save As to an unused path succeeds and updates the Tab label and window title

## Comments

Implemented on the `feat/multiFile` branch: `saveAs` in `src/stores/document.ts` now refuses a picked path that another Tab already holds (`isOpenInAnotherTab`, the same exact-match rule `openPathInTab` uses), shows a toast, and returns `false` so the Untitled Document stays pathless. The Tab doing the Save As is excluded from the check, so re-selecting a Document's own canonical path still writes normally. The guard lives at the Save As seam, so a background Untitled Tab's Guard save is refused too. Store coverage in `src/stores/__tests__/workspace.spec.ts` (collision, own-path re-select, free-path label/title update, Guard-save collision) and app-integration coverage in `src/__tests__/App.spec.ts` (toast on Cmd/Ctrl+Shift+S, free-path label/title update).

Verification: `vue-tsc --noEmit`, `npm test` (372 passing), `cargo test` (33 passing).
