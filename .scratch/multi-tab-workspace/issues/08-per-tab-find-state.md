# 08 — Per-Tab Find & Replace state

**What to build:** Find & Replace operates on the Active Document, and each Tab remembers its own query and current match, swapped in when that Tab becomes Active. Replacing in Preview Only still switches the Active Document to Split View first.

**Blocked by:** 02

**Status:** resolved

- [x] Find & Replace applies to the Active Document only
- [x] Each Tab keeps its own query and current match; switching Tabs shows that Tab's state
- [x] Replacing in Preview Only still switches the Active Document to Split View first

## Comments

Implemented in `70df5af` (`feat: per-Tab Find & Replace state — each Tab owns its query and current match`). `FindReplacePanel` binds its query and current-match state to the Active Tab's record (`document.activeTab().findQuery` / `.currentMatch`), so Find & Replace operates on the Active Document only and each Tab's search state is swapped in when the Tab becomes Active; `syncFromView` reconciles the record from the editor's preserved search state on open. Replacing in Preview Only already switched the Active Document to Split View first (`ui.showSourceForReplace`); a per-Tab regression test now locks that in. Tests at the app-integration and store seams (`App.spec.ts`, `workspace.spec.ts`).
