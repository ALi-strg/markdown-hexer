# Research — Tauri 2 + WebKitGTK: native titlebar stuck at initial title on Linux (works on Windows)

Status: research-notes (no code change)
Date: 2026-08-13

Relevant to: `set_document_title` command and the dual title-set path in the frontend
(`globalThis.document.title = <full title>` **and** Tauri `invoke` -> Rust `window.set_title()`).
Symptom: webview `document.title` (and WebdriverIO `browser.getTitle()`) is correct, but the
native GTK titlebar always shows the initial "Untitled.md — Markdown-Magic" on every Linux bundle
(.deb / .AppImage / Flatpak). Windows is fine.

**TL;DR:** On Linux, `document.title` and the native titlebar are **completely decoupled** — wry
never pushes the webview title into the GTK window. The native titlebar is set *only* by the
window-creation title (from `tauri.conf.json`) and by Tauri's `window.set_title()` (-> tao ->
`gtk_window_set_title()`). The reason `set_title()` visibly does nothing is tao's custom
client-side-decorations (GTK `GtkHeaderBar`) on Wayland: `gtk_window_set_title()` updates the
window/taskbar title but **not** the on-screen header bar, which keeps whatever title it was given
at creation. It was a tao bug (fixed only in tao 0.36 / upcoming Tauri), not a wry/WebKitGTK bug,
and not a race with `document.title`.

---

## 1. How wry/WebKitGTK sets the GTK window title

**wry never sets the GTK window title from the webview on Linux.** In
`src/webkitgtk/mod.rs` the only title-related code is a `connect_title_notify` on the
`WebKitWebView` that forwards the new title to the app-provided `document_title_changed_handler`:

```rust
// src/webkitgtk/mod.rs (dev)
if let Some(document_title_changed_handler) = attributes.document_title_changed_handler.take() {
  webview.connect_title_notify(move |webview| {
    let new_title = webview.title().map(|t| t.to_string()).unwrap_or_default();
    document_title_changed_handler(new_title)
  });
}
```

There is **no** `window.set_title()` / `gtk_window_set_title()` call anywhere in the webkitgtk
backend. So:

- Changing `document.title` via JS after load fires the webview `title` notify signal (that's why
  `browser.getTitle()` is green), but nothing touches the GTK `Gtk.Window:title` property.
- The GTK window title is controlled exclusively by:
  1. the initial title passed to tao's `WindowBuilder` (from `tauri.conf.json` `windows[].title`),
     applied at window creation (`window.set_title(&attributes.title)` in tao `window.rs`), and
  2. later `Window::set_title()` calls (Tauri `set_document_title` -> tao -> `gtk_window_set_title`).
- Tauri's own `WebviewBuilder.on_document_title_changed` (Rust) is `Option` and defaults to
  `None` — nothing observes the webview title by default (`crates/tauri/src/webview/mod.rs`).
  Even on Windows/macOS, wry only *fires* the same handler; it does not auto-rename the OS window.

Sources:
- https://github.com/tauri-apps/wry/blob/dev/src/webkitgtk/mod.rs
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/src/webview/mod.rs (line ~601 `on_document_title_changed`)
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/lib.rs (line ~4892, passes the handler through)

## 2. Known Tauri/tao issues: `set_title()` doesn't update the titlebar on Linux

### Finding A — the canonical issue: tauri#13749 "[bug] Window setTitle does not update header bar on Wayland"
- https://github.com/tauri-apps/tauri/issues/13749
- Reported with `tauri 2.6.2 / tao 0.34.0 / wry 0.52.1`, KDE Wayland, webkit2gtk 4.1.
- Exact symptoms observed there:
  1. Taskbar title **updates**.
  2. `Window.title()` (Tauri JS/`getter`) **updates**.
  3. The visible header bar **stays** at the config title (`tauri-window-test`).
- Under Xwayland (`WAYLAND_DISPLAY=`) the header bar updates fine → proves it's a
  Wayland/client-side-decorations problem, not the app.
- Root cause (per maintainers, labelled `status: upstream`): tao's custom CSD title bar.
- **Workaround posted by the reporter** (the reliable app-level fix for affected versions) —
  set the header bar title directly, not just the window title:
  ```rust
  use gtk::prelude::{BinExt, Cast, GtkWindowExt, HeaderBarExt};
  use gtk::{EventBox, HeaderBar};

  #[tauri::command]
  async fn set_window_title(app: AppHandle, label: &str, title: &str) -> Result<(), ()> {
    let w = app.get_webview_window(label).unwrap();
    w.set_title(title).unwrap();
    if let Some(titlebar) = w.gtk_window().unwrap().titlebar() {
      let event_box = titlebar.downcast::<EventBox>().unwrap();
      let header_bar = event_box.child().unwrap().downcast::<HeaderBar>().unwrap();
      header_bar.set_title(Some(title));
    }
    Ok(())
  }
  ```
- Closed 2026-06-29 by FabianLars: *"tauri-apps/tao#1046 was fixed. will be part of the next tauri release."*

### Finding B — the upstream defect: tao#1046 + tao PR #979 (custom CSD introduced) + tao PR #1218 (the fix)
- tao#1046 "Remove client decorations (linux/wayland)": https://github.com/tauri-apps/tao/issues/1046
- tao PR #979 (landed in **tao 0.30.3**) replaced GTK's default CSD with a **custom** `GtkHeaderBar`
  on Wayland (changelog: "added buttons for maximize and minimize in the title bar", "fixed
  moving/resizing the window by dragging the header bar"). A custom title bar installed with
  `gtk_window_set_titlebar()` is a separate GTK widget: `gtk_window_set_title()` only sets
  `Gtk.Window:title`, and per GTK3 docs a custom title bar widget is *not* updated by it.
  https://docs.gtk.org/gtk3/method.Window.set_title.html , https://docs.gtk.org/gtk3/method.Window.set_titlebar.html
- tao PR #1218 "fix(wayland): fix client-side decorations and apply them only when necessary":
  https://github.com/tauri-apps/tao/pull/1218 — merged 2026-06-29, released in **tao 0.36.0**.
  It mostly **reverts #979** (back to GTK's default CSD, where GTK binds the header bar title to
  `Gtk.Window:title`, so `set_title()` works again) and fixes the whole cluster:
  tao#899, tao#1046, tauri#6562, tauri#13440, tauri#13749, tauri#14251, tauri#14748.
  Changelog entry: *"Title bar buttons and changing of the title should now work as expected."*

### Finding C — why it is "all bundles" and not a packaging bug
- The titlebar behavior is identical across `.deb`, `.AppImage`, Flatpak because all three run the
  same GTK3/tao binary; bundle type is irrelevant. What matters is the **session/compositor**:
  under **Wayland**, tao 0.30.3+ installs the custom CSD header bar → `set_title()` is a no-op
  visually. Under X11 (SSD) `gtk_window_set_title()` goes through the WM and works, which is why
  Xwayland users and CI screenshots look fine.

## 3. The interplay: document.title vs window.set_title() on Linux

- There is **no winner / no override race** on Linux. wry (webkitgtk) has zero wiring between the
  webview `title` and the GTK window title (see §1). `document.title` never reaches the native
  titlebar, and it never clobbers a title set via `set_title()`.
- The known "HTML title wins over the native title" lore is a **Windows/WebView2** thing, where
  wry *does* observe `DocumentTitleChanged`; on WebKitGTK there is no equivalent propagation.
- So in this app, the two title-set paths are effectively independent:
  - `document.title` → webview only → drives `browser.getTitle()` (E2E), the tab title in the
    custom in-app UI, etc.
  - `set_document_title` → `window.set_title()` → tao → `gtk_window_set_title()` → broken for the
    visible header bar under tao-CSD/Wayland (§2A).
- If the app had *relied on* `document.title` to rename the OS window on Windows, that is not how
  it works there either; on Windows the `set_title()` invoke is what updates the title bar (and it
  works there because Win32 `SetWindowText` has no CSD problem).

## 4. Recommended fix / pattern for Tauri 2 Linux

1. **Upgrade once the fix ships (the real fix).** tao 0.36 / PR #1218 fixes it; it is in Tauri
   `dev` but **not yet** in any stable release as of 2026-08-13 (latest stable `tauri v2.11.5`,
   2026-07-01, still pins `tao 0.35.0`). Track tauri#13749 / tao#1046 for the release that pulls
   tao 0.36.
2. **App-level workaround for now (Linux only):** in the Rust `set_document_title` command, after
   `window.set_title(...)`, also set the CSD header bar's title via
   `window.gtk_window().titlebar()` (RunasSudo's snippet in §2A). This is the exact fix validated
   against this bug.
3. **Avoid relying on `document.title` for the native titlebar on any platform.** It is not wired
   to the OS window in stock Tauri (default `on_document_title_changed` is a no-op). If you want a
   single source of truth, centralize title updates in the Rust command.
4. **Debug aids / validation on Linux:**
   - Confirm the environment: `echo $XDG_SESSION_TYPE` — expect `wayland` on broken boxes, `x11`
     on the ones where it "works". Forcing X11 (`GDK_BACKEND=x11`, or running on Xorg) sidesteps
     the CSD bug but is a workaround, not a fix.
   - `wmctrl -l` / `xprop WM_NAME` only proves the WM/taskbar title (which already updates);
     the visible header bar is a separate GTK widget.
5. **E2E gap (see §5):** add a test that cannot be fooled by `document.title`, e.g. call the Rust
   command and assert on GTK state (`window.gtk_window().titlebar()`'s title) or screenshot the
   title bar region. `browser.getTitle()` will never catch this class of bug.

## 5. Why `browser.getTitle()` is green while the titlebar is wrong

- WebdriverIO `browser.getTitle()` maps to the W3C WebDriver **"Get Title"** command, which returns
  the current top-level browsing context's *active document's title* — i.e. `document.title` in the
  webview. It has no access to the OS window title.
  https://w3c.github.io/webdriver/#get-title
- Therefore a green `getTitle()` assertion only proves the webview title is correct. It cannot see
  the GTK title bar, so the E2E suite passing while the native titlebar is broken is exactly the
  expected outcome for this bug.

---

## Ranked most-likely root causes for "native titlebar stuck at initial title on all Linux bundles, webview title correct, Windows works"

1. **tao custom CSD on Wayland does not update the visible header bar on `set_title()`**
   (tao PR #979 regression; tauri#13749; fixed by tao PR #1218 → tao 0.36, unreleased stable).
   The initial header-bar title from `tauri.conf.json` is shown forever; taskbar + `Window.title()`
   update. Almost certainly this — check `XDG_SESSION_TYPE=wayland` on the affected machines.
2. **`document.title` was assumed to rename the OS titlebar on Linux.** It never does in
   wry/WebKitGTK; if the app's "second setter" only updates `document.title` it contributes nothing
   on Linux. (Contributing/confusing factor, not a competing root cause — there is no race.)
3. **Windows-only difference in *why* the titlebar updates**: on Windows the `set_title()` invoke
   updates the Win32 title bar (no CSD), so the identical code looks correct there — strengthening
   #1, not an independent cause.
4. **X11 vs Wayland session split among testers**: anyone testing under X11 (Xorg/Xwayland) sees
   `set_title()` work (SSD); under Wayland it breaks — which explains "works on Windows" and "all
   Linux bundles fail" being reported simultaneously.
5. Lower probability / not implicated by the evidence: a WebKitGTK "webview overrides GTK title at
   load" race (no such wiring exists in wry) and a wry title-changed emission bug on WebKitGTK
   (the notify signal does fire; it just isn't connected to the window).
