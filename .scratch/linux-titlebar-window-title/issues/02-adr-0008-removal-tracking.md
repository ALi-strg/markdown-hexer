# 02 — ADR 0008 + removal tracking

**What to build:** an ADR documenting the Linux titlebar workaround decision: the trade-off (apply a Linux-only header-bar workaround now vs. wait for the upstream tao 0.36 fix that has no stable release date), why the webview `document.title` is not a native-titlebar setter on WebKitGTK, why no automated seam can catch this regression, and a tracker to remove the workaround when a Tauri release ships tao 0.36 (track tauri#13749 / tao#1046).

**Blocked by:** 01 — Linux-only native titlebar workaround (the ADR records the implemented decision).

**Status:** ready-for-agent

- [ ] ADR 0008 exists and records the workaround-vs-wait trade-off and the validated upstream fix (tao 0.36).
- [ ] It explains why the webview `document.title` and the native titlebar are decoupled on Linux.
- [ ] It documents the "remove when tao 0.36 ships" tracking and points at the relevant issue(s).
- [ ] It records the manual Wayland verification as the only real-machine validation.
