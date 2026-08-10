# 05 — Close semantics: Guard, neighbor activation, last-Tab closes window

**What to build:** Each Tab gains a close control. Closing a Dirty Tab runs the Confirm-Discard Guard and Cancel keeps the Tab open. Closing the Active Tab activates the Tab to its right, or the new last Tab. Closing the last Tab closes the window; closing the window with several Dirty Tabs runs the Guard once per Dirty Tab, sequentially, and Cancel on any of them aborts the close.

**Blocked by:** 02

**Status:** resolved

- [x] Closing a Dirty Tab prompts via the Confirm-Discard Guard; Cancel keeps it, Save/Don't Save close it
- [x] Closing the Active Tab activates the Tab to its right, or the new last Tab
- [x] Closing the last Tab closes the window
- [x] Window close with several Dirty Tabs prompts once per Dirty Tab; Cancel on any aborts the close

## Comments

Implemented in `de69ac6`: the Tab Bar gains a per-Tab close control (a sibling button of the label button, so no nested interactive elements; `data-testid="tab-close"`). The store gains `closeTab(index)` — closing the Active Tab activates the Tab to its right, or the new last Tab; a background close leaves the Active Tab alone — plus `guardDocumentFor(tab)` and per-Tab `save`/`saveAs`/`writeToPath`, so the Guard's Save always targets the prompted Tab, never the Active one. App's `onTabClose` runs the Guard on a Dirty Tab (Cancel keeps it), then closes; the last Tab closes the window via a shared `destroyAppWindow()` seam (E2E builds keep the window alive). `onCloseRequested` now runs the Guard once per Dirty Tab, sequentially, aborting on any Cancel.

One design decision fell out of a failing test: the store **never removes the last remaining Tab** — the workspace must always hold at least one Tab because `ui.layoutMode` computes over `activeTab()`, and an empty workspace crashed the render flush before the window could close. App checks `tabs.length === 1` and destroys the window instead.

Verification: `vue-tsc --noEmit`, `npm test` (366 passing), `cargo test` (33 passing), `npm run test:e2e` (23/23 spec files, including new close-control tests in `tabs.e2e.ts` and a Guard-on-dirty-Tab-close test in `close-guard.e2e.ts`). Code review (Standards + Spec axes): no hard violations; the three actionable judgement calls were fixed — the duplicated E2E destroy seam unified into `destroyAppWindow()`, the right-neighbor test's Tabs given distinct contents so the editor-swap assertion is non-vacuous, and the dirty last-Tab close path covered by a new test.
