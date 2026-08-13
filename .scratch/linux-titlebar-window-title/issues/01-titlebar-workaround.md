# 01 — Linux-only native titlebar workaround

**What to build:** on a Wayland Linux host, the native OS titlebar follows the Active Document's filename and Dirty state (per the Window Title contract), instead of staying stuck at the initial title. This is a Linux-only change to the native title-setting command: after the existing `set_title`, also set the client-side-decorations header bar's title via the GTK window's `titlebar()`, defensively — silent no-op when `titlebar()` is `None` (X11/server-side decorations) or the downcast chain fails. A Linux-only `gtk` crate dependency is added. `format_window_title` unit tests stay green. Wayland verification is deferred to the next release's .deb on the reporter's machine (documented gap — no automated seam can exercise the broken path).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The native titlebar on a Wayland Linux host shows the opened file's name, the Tab-switched name, and the Dirty asterisk.
- [ ] The change is Linux-only; Windows/macOS title behaviour is untouched.
- [ ] The workaround is defensive: no crash or panic when there is no CSD header bar or the GTK structure differs.
- [ ] X11 Linux keeps working exactly as before (native API path).
- [ ] `format_window_title` unit tests still pass; `cargo test` is green.
- [ ] The E2E suite stays green (webview title assertions unchanged — they read `document.title`, not the titlebar).
