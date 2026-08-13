# 01 — Linux-only native titlebar workaround

**What to build:** on a Wayland Linux host, the native OS titlebar follows the Active Document's filename and Dirty state (per the Window Title contract), instead of staying stuck at the initial title. This is a Linux-only change to the native title-setting command: after the existing `set_title`, also set the client-side-decorations header bar's title via the GTK window's `titlebar()`, defensively — silent no-op when `titlebar()` is `None` (X11/server-side decorations) or the downcast chain fails. A Linux-only `gtk` crate dependency is added. `format_window_title` unit tests stay green. Wayland verification is deferred to the next release's .deb on the reporter's machine (documented gap — no automated seam can exercise the broken path).

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [ ] The native titlebar on a Wayland Linux host shows the opened file's name, the Tab-switched name, and the Dirty asterisk. (Deferred to the next release's .deb on the reporter's machine — no automated seam exists; see Comments.)
- [x] The change is Linux-only; Windows/macOS title behaviour is untouched.
- [x] The workaround is defensive: no crash or panic when there is no CSD header bar or the GTK structure differs.
- [x] X11 Linux keeps working exactly as before (native API path).
- [x] `format_window_title` unit tests still pass; `cargo test` is green.
- [x] The E2E suite stays green (webview title assertions unchanged — they read `document.title`, not the titlebar).

## Comments

Implemented in `src-tauri/src/title.rs` (`sync_csd_titlebar`) and wired into
`set_document_title` in `src-tauri/src/lib.rs` after the existing `set_title`.

- New Linux-only dep: `gtk = { version = "0.18", features = ["v3_24"] }`
  (`[target.'cfg(target_os = "linux")'.dependencies]`) — same gtk release tauri
  itself uses (0.18.2 in Cargo.lock), so the widget types unify.
- The GTK chain (`gtk_window()` → `titlebar()` → `downcast::<HeaderBar>` →
  `set_title`) runs inside `AppHandle::run_on_main_thread` because GTK3 widgets
  are only safe on the GTK main thread; `gtk_window()` itself is a thread-safe
  proxy. Every step is a silent early-return (`let … else`), matching the
  defensive contract.
- Verification: `cargo test` 33/33 (incl. the two `format_window_title`
  tests), `npm test` 397/397, zero compiler warnings. The Linux build was
  type-checked for `x86_64-unknown-linux-gnu` (sys-crate build scripts stubbed
  out; all Rust code genuine) — caught and fixed a `window` borrow across the
  `move` closure. Linux CI (`cargo test` on ubuntu-22.04) remains the gate for
  the release build.
- Wayland runtime behaviour is intentionally not exercised here: the first
  box stays unchecked until the reporter runs the next .deb.
