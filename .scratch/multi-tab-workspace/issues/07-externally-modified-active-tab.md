# 07 — Externally-Modified checks for the Active Tab

**What to build:** The Active Document is checked for external changes on window focus and on Tab activation; background Tabs are only checked when they become Active. The existing Reload / Overwrite / Cancel behavior is unchanged, and clean Documents still reload silently.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The Active Tab is checked on window focus and on Tab activation
- [ ] Background Tabs are not checked until they become Active
- [ ] A clean Active Tab reloads silently; a Dirty Active Tab gets Reload / Overwrite / Cancel as today
