# 03 — Per-Tab editor state preservation

**What to build:** Switching Tabs preserves each Tab's cursor position, scroll offset, and undo history, so returning to a file lands exactly where the user left off. New, Open, and external reload keep the destructive editor rebuild that clears undo history, exactly as today.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Switching away from a Tab and back restores its cursor position and scroll offset
- [ ] Undo history survives a Tab round-trip
- [ ] New, Open, and external reload still clear the editor state as today
