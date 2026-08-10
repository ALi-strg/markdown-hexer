# 04 — Per-Document Layout Mode

**What to build:** Each Document keeps its own Layout Mode. A newly created Tab gets the auto-choice (Open → Preview Only, New → Split View). The Layout Switcher and `Ctrl/Cmd+Shift+P` change only the Active Document's mode; switching Tabs switches the whole window to that Tab's mode. The split divider position stays app-wide.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Each Tab's mode is chosen at creation (Open → Preview Only, New → Split View) and is independent of other Tabs
- [ ] The Layout Switcher and `Ctrl/Cmd+Shift+P` affect only the Active Document
- [ ] Switching Tabs displays the Active Document's mode
- [ ] The divider position remains app-wide across Tabs
