# 02 — ADR 0008 + removal tracking

**What to build:** an ADR documenting the Linux titlebar workaround decision: the trade-off (apply a Linux-only header-bar workaround now vs. wait for the upstream tao 0.36 fix that has no stable release date), why the webview `document.title` is not a native-titlebar setter on WebKitGTK, why no automated seam can catch this regression, and a tracker to remove the workaround when a Tauri release ships tao 0.36 (track tauri#13749 / tao#1046).

**Blocked by:** 01 — Linux-only native titlebar workaround (the ADR records the implemented decision).

**Status:** ready-for-human

- [x] ADR 0008 exists and records the workaround-vs-wait trade-off and the validated upstream fix (tao 0.36).
- [x] It explains why the webview `document.title` and the native titlebar are decoupled on Linux.
- [x] It documents the "remove when tao 0.36 ships" tracking and points at the relevant issue(s).
- [x] It records the manual Wayland verification as the only real-machine validation.

## Comments

Implemented in `docs/adr/0008-linux-titlebar-workaround.md`.

- Records the trade-off: workaround-now (tauri#13749's validated app-level pattern)
  vs. wait for tao 0.36 / PR #1218, which no stable Tauri release carries yet
  (2.11.5 pins tao 0.35.3, per `src-tauri/Cargo.lock`).
- Documents the `document.title` / native-titlebar decoupling on WebKitGTK (wry
  never propagates the webview title to the GTK window) and why `document.title`
  is not part of the workaround.
- Removal tracking: drop `sync_csd_titlebar` + the Linux-only `gtk` dependency
  when a stable Tauri ships tao 0.36; watch tauri#13749 / tao#1046.
- Verification section: no automated seam (WebDriver Get Title reads
  `document.title`; CI xvfb is X11/SSD), so the next release's .deb on the
  reporter's Wayland host is the only real-machine validation.
