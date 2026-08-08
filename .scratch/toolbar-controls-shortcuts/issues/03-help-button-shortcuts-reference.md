# 03 — Help button + Shortcuts Reference

**What to build:** A Help button at the right end of the toolbar, past the Layout Switcher, hidden in Preview Only. Clicking it opens a read-only Shortcuts Reference modal listing every shortcut drawn from the registry, grouped File / Edit / Format / View / Help. `Ctrl/Cmd+/` toggles the modal from any Layout Mode, including Preview Only. It is dismissed by Esc, by clicking outside, or by pressing the button again, and opening or closing it never changes the Document or the editor state.

**Blocked by:** 01 — Shortcut registry, tooltips, and new formatting shortcuts; 02 — Document Controls and Undo/Redo

**Status:** ready-for-agent

- [ ] A Help button sits at the right end of the toolbar past the Layout Switcher and is hidden in Preview Only
- [ ] Clicking it opens a read-only modal listing every shortcut, grouped File / Edit / Format / View / Help, drawn from the same registry the tooltips use
- [ ] `Ctrl/Cmd+/` opens and closes the modal from any Layout Mode, including Preview Only
- [ ] Esc, clicking outside, or pressing the button again closes the modal
- [ ] Opening and closing never changes the Document or editor state
- [ ] Integration coverage for opening, content, dismissal paths, and the Preview Only shortcut path

## Notes

The list is generated from the registry — never a second hand-maintained list. Entries are static text; no click-to-run or click-to-copy.
