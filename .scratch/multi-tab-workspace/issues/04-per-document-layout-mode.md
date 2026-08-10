# 04 — Per-Document Layout Mode

**What to build:** Each Document keeps its own Layout Mode. A newly created Tab gets the auto-choice (Open → Preview Only, New → Split View). The Layout Switcher and `Ctrl/Cmd+Shift+P` change only the Active Document's mode; switching Tabs switches the whole window to that Tab's mode. The split divider position stays app-wide.

**Blocked by:** 02

**Status:** resolved

- [x] Each Tab's mode is chosen at creation (Open → Preview Only, New → Split View) and is independent of other Tabs
- [x] The Layout Switcher and `Ctrl/Cmd+Shift+P` affect only the Active Document
- [x] Switching Tabs displays the Active Document's mode
- [x] The divider position remains app-wide across Tabs

## Comments

Implemented in `58286b6`: the ui store's `layoutMode` becomes a computed over the Active Tab's record (which already carried the creation-time choice — New → Split View, Open → Preview Only), and `cycleLayoutMode`/`setLayoutMode`/`showSourceForReplace` now mutate the Active Tab's mode only. The obsolete auto-choice/override machinery (`applyDocumentLoadMode`, `manualOverrideActive`, `applyManualMode`) is deleted along with its App.vue call sites — a per-Tab mode is inherently sticky, so the override concept is gone. `dividerPosition` stays app-wide. One mechanism fix fell out of the per-Tab semantics: a Tab restored while its pane is visible now clears any stale deferred scroll offset, so the mode-change watcher can no longer replay an older Tab's offset over the freshly restored one. Tests: ui.spec reworked to the per-Tab model (independence, mode-on-switch, divider-across-Tabs), App.spec gains four integration tests (switcher and shortcut act per Active Document, panes render the Active Tab's mode on switch, divider app-wide across Tabs), and the scroll-deferral test was rewritten for per-Tab modes.

Verification: `vue-tsc --noEmit`, `npm test` (345 passing), `cargo test` (33 passing), `npm run test:e2e` (23/23 spec files). Code review (Standards + Spec axes): no findings requiring changes beyond the three P3 judgement calls — map drift fixed in `docs/codebase-map.md`, redundant record assertions trimmed from the new app tests, shared pushTab fixture declined (cross-spec coupling not worth it for a 6-line literal).
