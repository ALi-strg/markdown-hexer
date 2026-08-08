# 01 — Shortcut registry, tooltips, and new formatting shortcuts

**What to build:** The single shortcut registry — one mapping from each toolbar control to its label and keyboard shortcut — that the tooltips and the Shortcuts Reference both draw from, so they can never drift. Existing toolbar controls show consistent native tooltips formatted `Name (Ctrl/Cmd+X)`, where the control has a shortcut the key is shown, otherwise the name alone. Heading, List, Link, and Code gain keyboard shortcuts (`Ctrl/Cmd+Shift+H`, `Ctrl/Cmd+Shift+L`, `Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+C`) that apply the formatting from anywhere in a source-visible Layout Mode and no-op in Preview Only, joining the normal undo history.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A single registry maps every toolbar control to its label and shortcut, and both the tooltips and the Shortcuts Reference consume it (the four new shortcuts are registered here so later tickets reuse the entry)
- [ ] Every existing toolbar control shows its shortcut in its native hover tooltip, formatted `Name (Ctrl/Cmd+X)`; controls without a shortcut (Theme, Font) show the name only
- [ ] The Layout Switcher segments' tooltips include the cycle-layout shortcut
- [ ] `Ctrl/Cmd+Shift+H`, `Ctrl/Cmd+Shift+L`, `Ctrl/Cmd+K`, and `Ctrl/Cmd+Shift+C` apply Heading, List, Link, and Code formatting respectively, in source-visible modes, reversible via undo
- [ ] The four new shortcuts no-op in Preview Only, consistent with Bold/Italic
- [ ] Tooltips for Heading/List/Link/Code show their new shortcuts
- [ ] Integration coverage for the tooltip strings and for the four new key bindings applying formatting

## Notes

The shortcut-conflict check is already done: the installed Markdown language support binds only Enter and Backspace, and `basicSetup`'s default keymap claims none of the new keys, so nothing is shadowed.
