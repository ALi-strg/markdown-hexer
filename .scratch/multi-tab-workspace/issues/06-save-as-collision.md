# 06 — Save As collision guard

**What to build:** Save As to a path that is already open in another Tab is refused with a message, keeping the one-Tab-per-path invariant unbroken. Save As to a free path succeeds and updates that Document's Tab label and the window title as today.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Save As to a path open in another Tab is refused and shows a message; the Untitled Document keeps its pathless state
- [ ] Save As to an unused path succeeds and updates the Tab label and window title
