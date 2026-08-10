# 05 — Close semantics: Guard, neighbor activation, last-Tab closes window

**What to build:** Each Tab gains a close control. Closing a Dirty Tab runs the Confirm-Discard Guard and Cancel keeps the Tab open. Closing the Active Tab activates the Tab to its right, or the new last Tab. Closing the last Tab closes the window; closing the window with several Dirty Tabs runs the Guard once per Dirty Tab, sequentially, and Cancel on any of them aborts the close.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Closing a Dirty Tab prompts via the Confirm-Discard Guard; Cancel keeps it, Save/Don't Save close it
- [ ] Closing the Active Tab activates the Tab to its right, or the new last Tab
- [ ] Closing the last Tab closes the window
- [ ] Window close with several Dirty Tabs prompts once per Dirty Tab; Cancel on any aborts the close
