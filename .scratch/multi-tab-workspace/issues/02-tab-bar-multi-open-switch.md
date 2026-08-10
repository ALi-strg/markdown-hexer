# 02 — Tab Bar, multi-open, switching, one-Tab-per-path, numbered Untitled

**What to build:** The core multi-Tab capability. A Tab Bar appears at the top of the window in every Layout Mode, showing every open Tab's filename and Dirty marker with a `+` affordance and click-to-activate. Opening a file — via the Open dialog, drag-drop, or an OS file-open — adds a Tab instead of replacing the current one, or focuses the existing Tab when that path is already open, and the Confirm-Discard Guard never fires on Open or New. `New` and the `+` affordance add a numbered Untitled Tab (`Untitled.md`, `Untitled 2.md`, …) that becomes Active. The window panes, window title, and relative-image resolution all follow the Active Document, and the editor loads the Active Tab's content on switch (a rebuild is acceptable here; state preservation is ticket 03).

**Blocked by:** 01

**Status:** resolved

- [x] The Tab Bar renders all open Tabs with filename and Dirty marker, a `+` affordance, and click-to-activate; visible in every Layout Mode
- [x] Open, drag-drop, and OS file-open add a Tab; opening an already-open path focuses its existing Tab with no duplicate
- [x] The Confirm-Discard Guard never appears on Open or New
- [x] `New` and `+` add a numbered Untitled Tab that becomes Active
- [x] Clicking a Tab activates it; the panes, window title, and relative image resolution follow the Active Document
- [x] Switching Tabs shows that Tab's content in the editor and preview

## Comments

Implemented in `19e518f` (Tab Bar chrome in `src/components/TabBar.vue`, add-or-focus open via `document.openPathInTab`, numbered Untitled via a never-reused session counter, Guard never fired on Open/New, Tab activation swapping editor/preview/title/`asset://` scope). Review follow-ups landed in a later commit: a post-read duplicate re-check closes the add-or-focus race (two overlapping opens of the same new path can no longer insert two Tabs), and Save As now nulls a Tab's `untitledNumber` when it gains a canonical path, honoring the field's documented contract.

Verification: `npm test` (331 passing), `vue-tsc --noEmit`, `cargo test` (33 passing), `npm run test:e2e` (23/23 spec files, incl. `tabs.e2e.ts`).
