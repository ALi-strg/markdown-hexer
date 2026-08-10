# 09 — Tab shortcuts and Shortcuts Reference

**What to build:** `Ctrl/Cmd+T` creates a New Tab, `Ctrl/Cmd+W` closes the Active Tab, and `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle Tabs forward and back. All are registered in the single shortcut registry and listed in the Shortcuts Reference.

**Blocked by:** 02, 05

**Status:** resolved

- [x] `Ctrl/Cmd+T` creates a New Tab
- [x] `Ctrl/Cmd+W` closes the Active Tab (running the Confirm-Discard Guard when it is Dirty)
- [x] `Ctrl+Tab` and `Ctrl+Shift+Tab` cycle Tabs forward and back
- [x] The shortcuts appear in the Shortcuts Reference and conflict with no existing binding

## Comments

Implemented in `1831164` (`feat: tab shortcuts — Ctrl/Cmd+T New Tab, Ctrl/Cmd+W Close Tab, Ctrl+Tab cycles`). `TAB_SHORTCUTS` in `src/lib/shortcuts.ts` registers New Tab (`Ctrl/Cmd+T`), Close Tab (`Ctrl/Cmd+W`), Next Tab (`Ctrl+Tab`), and Previous Tab (`Ctrl+Shift+Tab`) in the single registry and a new "Tab" group in the Shortcuts Reference; `KeyCombo.ctrlOnly` makes the cycle combos Ctrl-only (Cmd+Tab is the macOS app switcher and never reaches the app) and `keyLabel` renders named keys like `Tab` without uppercasing them. `App.vue` dispatches them via `TAB_SHORTCUT_ORDER` (Previous before Next, since Next's combo also fires with Shift): New Tab reuses `runNewDocument`, Close Tab reuses `onTabClose` (so the Guard runs for a Dirty Active Tab and the last-Tab close destroys the window), and the cycle goes through the shared `onTabSwitch` core — the same editor-state capture/restore and external-modification path as clicking a Tab — over the store's new `cycleTab(delta)`. Tests at the app-integration and store seams (`App.spec.ts`, `document.spec.ts`) plus the shortcuts-reference e2e group check.
