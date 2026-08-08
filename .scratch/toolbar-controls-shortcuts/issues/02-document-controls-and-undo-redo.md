# 02 — Document Controls and Undo/Redo

**What to build:** The Document Controls group — New, Open, Save, Save As, and Find & Replace — at the left end of the toolbar, plus Undo and Redo beside the Formatting Buttons. All are visible in Split View and Focus Mode and hidden in Preview Only, which keeps showing only Theme, Font, and the Layout Switcher. Each control performs its action through the existing guarded flows (the Confirm-Discard Guard, the native dialogs, the Find & Replace panel). Undo and Redo reflect CodeMirror's native history: disabled when there is nothing to undo or redo, and dispatching the same undo/redo the shortcuts use. Every control shows its shortcut in its tooltip via the registry. The toolbar wraps onto a second row rather than overflowing when the window is narrow.

**Blocked by:** 01 — Shortcut registry, tooltips, and new formatting shortcuts

**Status:** ready-for-agent

- [ ] New, Open, Save, Save As, and Find & Replace controls appear at the left end of the toolbar, each showing its shortcut in its tooltip
- [ ] The controls are visible in Split View and Focus Mode and hidden in Preview Only; the Preview Only toolbar shows only Theme, Font, and the Layout Switcher
- [ ] Save and Save As write through the existing Save flow (Save on an Untitled Document behaves as Save As), New and Open run the Confirm-Discard Guard, and Find & Replace opens the existing panel
- [ ] Undo and Redo controls sit beside the Formatting Buttons, hidden in Preview Only, with tooltips showing `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`
- [ ] Undo and Redo are disabled when the history has nothing to undo or redo, and dispatch the native undo/redo otherwise
- [ ] The toolbar wraps to a second row rather than overflowing or hiding controls at the minimum window width
- [ ] Integration coverage for visibility across all three Layout Modes and for the end-to-end effect of each control

## Notes

The preview-cleanliness rule is owned here: after this ticket the Preview Only toolbar is exactly Theme, Font, and Layout Switcher, and stays that way.
