# Spec: Linux native titlebar stuck at the initial title

Status: ready-for-agent

## Problem Statement

On Linux, the native OS window titlebar always shows the initial `Untitled.md — Markdown-Magic`, even after an existing `.md` file with a different name is opened. The Title Bar's in-app label and the webview `document.title` update correctly; only the **native titlebar** is wrong. This affects **all three Linux Bundles (.deb, .AppImage, Flatpak)** on the reporter's machine, while **Windows is correct**.

Root cause (established): on a **Wayland** session, tao 0.30.3+ (the windowing layer beneath Tauri 2) installs a custom GTK `GtkHeaderBar` for client-side decorations. `gtk_window_set_title()` then only updates `Gtk.Window:title` (taskbar, `Window.title()` getter) and **not the visible header bar widget**, which keeps whatever title it was given at window creation. This is a known tao regression (tauri#13749), fixed upstream in tao 0.36 / PR #1218 — **not yet in any stable Tauri release** (v2.11.5 pins tao 0.35.3). Windows has no such problem because Win32 `SetWindowText` has no CSD path. The webview `document.title` and the native titlebar are fully decoupled on WebKitGTK (wry never pushes one to the other), so the frontend's `document.title` setter contributes nothing to the native titlebar.

## Solution

Apply a **Linux-only Rust workaround** in the `set_document_title` command: after calling `window.set_title(...)`, also set the title of the CSD header bar directly by downcasting `gtk_window().titlebar()`. The change is defensive — if `titlebar()` is `None` (X11/server-side decorations) or the downcast chain fails (tao structure differs), it silently no-ops. The workaround is tracked for removal once a Tauri release pulls in tao 0.36.

The native titlebar then reflects the Active Document's filename and Dirty state exactly as the glossary's Window Title contract describes, on both Wayland and X11 Linux.

## User Stories

1. As a Linux user on Wayland, I want the window titlebar to show the opened file's name, so that I can identify which Document the window holds without looking inside it.
2. As a Linux user on Wayland, I want the titlebar to update when I switch between Tabs, so that the OS title always mirrors the Active Document.
3. As a Linux user on Wayland, I want the Dirty asterisk to appear in the titlebar when the Active Document is Dirty, so that unsaved changes are visible at the OS level.
4. As a Linux user on Wayland, I want the titlebar to behave identically to the .deb, Flatpak, and .AppImage Bundles, so that no Bundle is a degraded experience.
5. As a Linux user on X11, I want the titlebar to keep working exactly as before, so that the workaround does not break the session type where the native API already works.
6. As a Windows/macOS user, I want the titlebar to remain correct, so that the Linux-only change has no cross-platform effect.
7. As a maintainer, I want the workaround gated to Linux, so that no non-Linux code path is touched.
8. As a maintainer, I want the workaround to be defensive (silent no-op on failure), so that an unexpected GTK structure cannot crash the app.
9. As a maintainer, I want the workaround tracked for removal when tao 0.36 ships in a stable Tauri, so that the repo does not carry a permanent hack that masks an upstream fix.
10. As a maintainer, I want the root cause and workaround recorded in an ADR, so that a future reader understands why `set_document_title` touches the header bar.

## Implementation Decisions

- **Modify the existing `set_document_title` command** (the single place the native title is set). After the current `window.set_title(...)`, add the Linux-only header-bar update. No new IPC surface; the frontend keeps its existing two-path title setting unchanged.
- **New Linux-only dependency**: the `gtk` crate (version 0.18.x) is added as a `target.'cfg(target_os = "linux")'` dependency. It is already present in the lockfile transitively (tauri uses gtk 0.18.2), so no version conflict. The gtk types are used only inside the Linux-gated workaround.
- **The workaround shape** (decision-rich; validated against this bug upstream in tauri#13749):
  - `window.set_title(title)` (existing behaviour, unchanged),
  - then, if `gtk_window().titlebar()` is `Some`, downcast it to the CSD container and its child `GtkHeaderBar`, and call `header_bar.set_title(Some(title))`.
  - Any `unwrap`-style failure in the downcast chain is replaced by a silent `if let` no-op — this code must never crash the app, and the GTK widget structure could differ across tao versions.
- **Removal tracking**: a comment and an ADR note mark the workaround as "remove when Tauri ships tao 0.36" (track tauri#13749 / tao#1046). The ADR records the trade-off: workaround now vs. wait for an upstream fix that has no stable release date.
- **No change to `document.title` handling**: it serves the webview/E2E and stays as-is; it is not wired to the native titlebar on WebKitGTK and never was.

## Testing Decisions

- What makes a good test here: a test must observe the **native titlebar**, not the webview `document.title`. `browser.getTitle()` (WebDriver "Get Title") reads `document.title` and cannot see the GTK titlebar, so the current E2E suite is green *because* of the bug — it cannot catch this regression. CI runs under xvfb (X11, server-side decorations), where `titlebar()` is `None` and the tao CSD bug does not manifest, so no automated seam in CI can exercise the broken path.
- **Primary seam (manual, on-host)**: real-machine verification on a Wayland Linux host. Per the plan, validation is deferred to the **next tagged release's .deb** on the reporter's machine — the reporter confirms the titlebar follows the opened filename and the Dirty asterisk after the fix ships.
- **Secondary seam (existing pattern)**: keep the Rust unit tests on `format_window_title` (already present in the title module) asserting the format string — the pure formatting logic remains tested and unchanged.
- **No new automated seam is proposed**: the honest constraint is that this bug is invisible to the existing suite. Adding a screenshot test on CI would assert a titlebar that cannot exhibit the bug under xvfb. This gap is documented in the ADR rather than papered over.
- Prior art: `src-tauri/src/title.rs` inline `#[cfg(test)]` module for title formatting; E2E title assertions in `e2e/specs/*.e2e.ts` (which verify the webview title and stay green).

## Out of Scope

- The **AppImage-only white window** — separate spec (`.scratch/appimage-linux-render/spec.md`), different root cause (bundler payload / XWayland pin).
- Shipping an upgraded Tauri to pull in tao 0.36 — the upstream fix is not yet in a stable release; tracked, not implemented here.
- Forcing the app to run under X11 (`GDK_BACKEND=x11`) as a workaround — rejected: it is a session-level change, not a titlebar fix, and would degrade the Wayland-native experience.
- Non-Linux titlebar behaviour — untouched and already correct.

## Further Notes

- Reference research: `.scratch/linux-titlebar-window-title/research-linux-titlebar-not-updating.md`.
- The reporter's session is Wayland (`XDG_SESSION_TYPE=wayland`), consistent with the tao CSD root cause.
- The AppImage's titlebar being stuck is folded into the AppImage render spec — on the AppImage the webview likely never boots, so the config title persists (a symptom of the render bug, not this tao bug).
- gtk 0.18.2 is already in `src-tauri/Cargo.lock`; adding it as a direct Linux-only dependency is low-risk.
- `Window::gtk_window()` is available in tauri 2.11.5 (`src/window/mod.rs`) — verified.
