# 03 — Per-Tab editor state preservation

**What to build:** Switching Tabs preserves each Tab's cursor position, scroll offset, and undo history, so returning to a file lands exactly where the user left off. New, Open, and external reload keep the destructive editor rebuild that clears undo history, exactly as today.

**Blocked by:** 02

**Status:** resolved

- [x] Switching away from a Tab and back restores its cursor position and scroll offset
- [x] Undo history survives a Tab round-trip
- [x] New, Open, and external reload still clear the editor state as today

## Comments

Implemented in the working tree (uncommitted at close; see the commit for this ticket). One mounted CodeMirror instance swaps per-Tab state instead of rebuilding on switch:

- `src/lib/tabEditorState.ts` — a `WeakMap<Tab, { state, scrollTop }>` holding each Tab's preserved editor state. Deliberately outside the reactive store: a Vue/pinia reactive proxy around an `EditorState` breaks CodeMirror's strict state-identity checks on dispatch, and pinia's deep ref unwrapping mangles the class type (the same hazard the view's `shallowRef` documents). A `WeakMap` also lets the entry die with the Tab when it is closed.
- `src/components/EditorPane.vue` — `captureActiveTabState()` records the Active Tab's live state + scroll offset on switch-away; `restoreActiveTabState()` restores the preserved state via `view.setState` (cursor and undo history travel with the state) or rebuilds from the store when none exists; `paneVisible()`/deferred-scroll logic applies the offset when the pane is visible, deferring it when the incoming Tab is in Preview Only so a hidden pane's 0 never clobbers the preserved offset.
- `src/App.vue` — Tab activation, New, and Open all capture the outgoing Tab's state before the workspace switches. Tab activation and Open-onto-an-existing-Tab restore the preserved state; New and Open-of-a-new-file keep the destructive `replaceContent` rebuild (fresh content, cleared undo history) exactly as today.
- `src/stores/document.ts` — `reloadFrom` clears the preserved state (an external reload makes it stale) and the store exposes `activeTab()` for the editor pane.

Verification: `npm test` (340 passing, incl. new App-level round-trip, scroll, deferred-scroll, and reload-clears tests plus EditorPane capture/restore and store reload-clears specs), `vue-tsc --noEmit`, `npm run build`, `cargo test` (33 passing), `npm run test:e2e` (23/23 spec files). Code review (both axes) found no hard violations; one spec-side gap (deferred scroll lost when the pane later becomes visible) was fixed and covered by a test.
