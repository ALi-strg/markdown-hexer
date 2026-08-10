# 02 — Tab Bar, multi-open, switching, one-Tab-per-path, numbered Untitled

**What to build:** The core multi-Tab capability. A Tab Bar appears at the top of the window in every Layout Mode, showing every open Tab's filename and Dirty marker with a `+` affordance and click-to-activate. Opening a file — via the Open dialog, drag-drop, or an OS file-open — adds a Tab instead of replacing the current one, or focuses the existing Tab when that path is already open, and the Confirm-Discard Guard never fires on Open or New. `New` and the `+` affordance add a numbered Untitled Tab (`Untitled.md`, `Untitled 2.md`, …) that becomes Active. The window panes, window title, and relative-image resolution all follow the Active Document, and the editor loads the Active Tab's content on switch (a rebuild is acceptable here; state preservation is ticket 03).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The Tab Bar renders all open Tabs with filename and Dirty marker, a `+` affordance, and click-to-activate; visible in every Layout Mode
- [ ] Open, drag-drop, and OS file-open add a Tab; opening an already-open path focuses its existing Tab with no duplicate
- [ ] The Confirm-Discard Guard never appears on Open or New
- [ ] `New` and `+` add a numbered Untitled Tab that becomes Active
- [ ] Clicking a Tab activates it; the panes, window title, and relative image resolution follow the Active Document
- [ ] Switching Tabs shows that Tab's content in the editor and preview
