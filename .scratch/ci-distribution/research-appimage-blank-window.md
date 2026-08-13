# Research — AppImage-only white/blank window in Tauri 2 + WebKitGTK (`.deb` and Flatpak fine, same machine)

Status: research-notes (no code change)
Date: 2026-08-13

Relevant to: `spec.md` item 4 and ADR 0007. ADR 0007 assumes the DMABUF blank-window is "host-GPU, not packaging — the `.deb` on the same machine would fail identically." This research shows AppImage-specific mechanisms that reproduce the *same symptom* (white/blank window, titlebar only) while `.deb`/Flatpak keep working. The `WEBKIT_DISABLE_DMABUF_RENDERER=1` override in `main()` does **not** neutralize several of these, because the failure is in subprocess spawn / EGL-GBM init / library mismatch, not in the DMABUF compositor path.

---

## 1. WebKitGTK sandbox (bubblewrap) failing inside the AppImage

Mechanism (from WebKit source):

- WebKitGTK 2.26+ ships a web-process sandbox, enabled per-context via `webkit_web_context_set_sandbox_enabled()`. It is bubblewrap-based and *must be set before any web process is spawned* (`WebKitWebContext.cpp`, "Sandboxing cannot be changed after subprocesses were spawned").
- Env overrides, in `WebKit/UIProcess/glib/WebProcessPoolGLib.cpp`:
  - `WEBKIT_FORCE_SANDBOX=1` forces the sandbox on. Setting it to anything else does **not** disable it — WebKit logs: *"WEBKIT_FORCE_SANDBOX no longer allows disabling the sandbox. Use WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 instead."*
  - `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` is the escape hatch that turns the sandbox off.
- If the sandbox is active and `bwrap` cannot build its user/mount namespace (e.g. `kernel.unprivileged_userns_clone=0` / seccomp-AppArmor blocking unprivileged user namespaces, or problems setting up mounts against the FUSE-mounted squashfs), the `WebKitWebProcess`/`WebKitNetworkProcess` fail to spawn. WebKitGTK's UI shows an empty (white) window with only the titlebar — the page never paints.
- `tauri#5130 "[bug] GLib-Critical: Operation not permitted"` shows the tell-tale of the subprocess sandbox/scheduler path failing under restricted permissions (`Failed to set scheduler settings: Operation not permitted`).
- `wry#935 "Enable sandbox on WebkitGTK"` documents that Tauri couldn't even use the sandbox before webkit 2.38; once present, it is exactly the kind of per-process sandbox that breaks in AppImage/container contexts.

Fix that works: run with `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` (or call `webkit_web_context_set_sandbox_enabled(FALSE)` before any `WebView` exists). `WEBKIT_FORCE_SANDBOX=0` / `--no-sandbox` do **not** disable it.

Sources:
- https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/glib/WebProcessPoolGLib.cpp (env-var handling)
- https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/glib/WebKitWebContext.cpp (`webkit_web_context_set_sandbox_enabled`, 2.26+)
- https://github.com/tauri-apps/wry/issues/935
- https://github.com/tauri-apps/tauri/issues/5130

## 2. FUSE mount issues / `APPIMAGE_EXTRACT_AND_RUN`

- If FUSE is missing or broken the AppImage runtime refuses to start entirely (`AppImages require FUSE to run.`) — a different failure than a white window. `/tmp` mounted `noexec` or a stale `libfuse2` are the usual triggers (AppImage docs).
- The relevant case is the opposite direction: when the FUSE mount is *present but pathological for the sandbox/subprocess model*, running the AppImage **extracted** bypasses it:
  - `./App.AppImage --appimage-extract-and-run` or `APPIMAGE_EXTRACT_AND_RUN=1 ./App.AppImage` extracts to a real directory and runs `AppRun` from there.
  - This is the standard fix when the sandbox (bubblewrap) or subprocess exec misbehaves against the FUSE-mounted squashfs, or when anything assumes a real executable path (WebKit re-execs its helper binaries; an unusual path like `/tmp/.mount_App.../usr/lib/...` plus a new mount namespace is a known source of trouble).
- Note the AppImage GTK hook already special-cases extraction: it exports `APPDIR="${APPDIR:-$(dirname $(realpath $0))}"` "# Workaround to run extracted AppImage".

Sources:
- https://docs.appimage.org/user-guide/troubleshooting/fuse.html
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy-plugin-gtk.sh

## 3. Bundled libraries (the strongest lead)

Tauri's AppImage bundler (linuxdeploy + linuxdeploy-plugin-gtk) **bundles libwebkit2gtk, gtk3, gdk-pixbuf, and the glib/gstreamer/wayland family into `usr/lib` of the AppImage**, and the AppRun hook sets `LD_LIBRARY_PATH`, `GTK_PATH`, `GIO_EXTRA_MODULES`, `GDK_PIXBUF_MODULE_FILE`, `GST_PLUGIN_SYSTEM_PATH_1_0`, etc. `.deb` and Flatpak instead use one consistent (system or runtime) WebKit stack. So the AppImage runs a *different* WebKit/GLib/EGL stack than the other two bundles on the same machine — any mismatch or incompatibility is AppImage-only.

- `tauri#2689 "symbol lookup error with the .AppImage"` (closed). Bundled `libwebkit2gtk` in the AppImage mismatched the **system** helper binaries:
  ```
  WebKitNetworkProcess: undefined symbol: NetworkProcessMainUnix
  WebKitWebProcess: undefined symbol: WebProcessMainUnix
  ```
  → blank window. `.deb` was fine. Fixed by aligning bundled versions (bundler PR `tauri#2940`).
- `tauri#15665 "AppImages from default bundler settings fail on Mesa 25+ distros"` (open, 2026 — the canonical modern report of "AppImage starts, window never appears"):
  1. linuxdeploy bundles `libwayland-client.so.0` (+ the glib family that pins it) into `usr/lib`. On newer Mesa (25+) the host Mesa loads *against the bundled libwayland-client*, `eglGetDisplay(EGL_DEFAULT_DISPLAY)` fails with `EGL_BAD_PARAMETER`, and `WebKitWebProcess` prints `Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...` and dies → no window. Confirmed by LD_PRELOAD bisection.
  2. `AppRun` exports `GST_PLUGIN_SYSTEM_PATH_1_0=$APPDIR/usr/lib/gstreamer-1.0` unconditionally, but with default `bundleMediaFramework:false` that dir is never created → GStreamer's default plugin search is disabled, WebKit media setup fails (`GStreamer element appsink not found`), render process dies.
  3. The bundled WebKit helper binaries only have `RUNPATH=$ORIGIN`; any launch path not going through AppRun's `cd $APPDIR/usr` makes the bundled `libwebkit2gtk` spawn the *system* WebKit helpers → version mismatch kills `WebKitNetworkProcess` (SIGBUS).
  - Working fix (from the issue): strip the over-bundled infra libs from the AppDir (`libwayland-*`, `libglib-2.0`/`libgio-2.0`/`libgobject-2.0`/`libgmodule-2.0`, all `libgst*`, `libmount`/`libblkid`/`libselinux`/`libpcre2-8`, `libzstd`/`libelf`/`libffi`) and point `usr/lib/gstreamer-1.0` at the system plugin dir. Bundler feature in flight: `tauri#15662` adds `bundle.linux.appimage.excludeLibraries`.
- `tauri#11988 "AppImages built on Linux Mint do not work for Fedora with Tauri 2.0"` — same `Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...` white screen; closed as a dup of `tauri#11994` (GPU/EGL, not planned).

This is also why the existing `WEBKIT_DISABLE_DMABUF_RENDERER=1` override does not rescue the AppImage: when the crash is `eglGetDisplay → EGL_BAD_PARAMETER` or a helper-binary symbol/SIGBUS mismatch, the DMABUF switch is irrelevant — the process aborts before/independent of the DMABUF compositor path.

Sources:
- https://github.com/tauri-apps/tauri/issues/2689 (+ fix PR https://github.com/tauri-apps/tauri/pull/2940)
- https://github.com/tauri-apps/tauri/issues/15665
- https://github.com/tauri-apps/tauri/pull/15662 (excludeLibraries)
- https://github.com/tauri-apps/tauri/issues/11988
- https://github.com/tauri-apps/tauri/issues/11994

## 4. GPU / DMABUF / compositing — and the AppImage forcing X11

The AppImage GTK hook **forces X11**:
```
export GDK_BACKEND="${GDK_BACKEND:-x11}" # Crash with Wayland backend on Wayland - tauri-apps/tauri#8541
```
So on a Wayland desktop the AppImage runs under XWayland/X11 while the `.deb` and Flatpak run native Wayland. WebKitGTK's X11 render path (GBM/DMABUF) is exactly where the classic blank/white windows come from:

- `tauri#8254 "Empty window, Failed to create GBM device for render device: /dev/dri/renderD128"` — `DRI driver not from this Mesa build`, `Failed to create GBM device`, app stays responsive, screen blank. Fix: `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- `tauri#10702 "Error 71 (Protocol error) dispatching to Wayland display"` — NVIDIA Wayland explicit-sync; the WebKit/GDK process aborts, window blank. Working fixes reported: `WEBKIT_DISABLE_DMABUF_RENDERER=1` (80 👍), `__NV_DISABLE_EXPLICIT_SYNC=1`, `__GL_THREADED_OPTIMIZATIONS=0`; upstream webkit bug 280210; partial fix in `tao#979`.
- `tauri#5143 "Blank screen on starting tauri application"` — root cause is a WebKitGTK bug (webkit bug 180739): DOM/JS load fine but nothing paints. Fix: `WEBKIT_DISABLE_COMPOSITING_MODE=1` (confirmed on NixOS, Ubuntu 20.04 X11+i3, Steam Deck).
- `tauri#9394 "Documenting Nvidia problems in Tauri"` — a maintainer-authored catalogue. Item 5 is the exact AppImage-only variant: an AppImage built on Ubuntu 22.04 ran under Wayland-but-actually-X11 on EndeavourOS and "the webview just dies on resize", fixed by `WEBKIT_DISABLE_COMPOSITING_MODE=1`; items 3/4: `WEBKIT_DISABLE_DMABUF_RENDERER=1` for the X11 `AcceleratedSurfaceDMABuf` and the Wayland `Error 71` failures.
- `tauri#15781` + merged `tauri#15786` (tauri 2.12): the AppImage GTK hook **overrides an explicitly-set `GDK_BACKEND`**, silently disabling Wayland-native behaviour; fix preserves a user-set `GDK_BACKEND`. Pre-2.12, the AppImage cannot be forced back to Wayland except by the env var (which the hook then clobbers).
- `wry#1366 "Wry cannot create windows on Arch Linux with Nvidia"` — same pair: Wayland → `Error 71`; X11 → `Failed to create GBM buffer` + white screen.

Bottom line: on the same machine, `.deb`/Flatpak render via the native Wayland (or a clean X11) stack while the AppImage is pinned to X11 and ships its own (possibly wrong) Mesa/wayland/EGL libs — a double whammy that the `WEBKIT_DISABLE_DMABUF_RENDERER` override does not fully cover. If the DMABUF flag alone isn't enough in the AppImage, the next candidates are `WEBKIT_DISABLE_COMPOSITING_MODE=1` and cleaning the bundled GPU libs (§3).

Sources:
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy-plugin-gtk.sh
- https://github.com/tauri-apps/tauri/issues/8254
- https://github.com/tauri-apps/tauri/issues/10702
- https://github.com/tauri-apps/tauri/issues/5143
- https://github.com/tauri-apps/tauri/issues/9394
- https://github.com/tauri-apps/tauri/issues/15781 and https://github.com/tauri-apps/tauri/pull/15786
- https://github.com/tauri-apps/wry/issues/1366

## 5. WebKitGTK resource path (`WEBKIT_EXEC_PATH`, injected bundle, helper binaries)

WebKitGTK locates its helper binaries (`WebKitWebProcess`, `WebKitNetworkProcess`, `WebKitGPUProcess`) and its injected bundle relative to compile-time paths baked into `libwebkit`, overridable via env:

- `WEBKIT_INJECTED_BUNDLE_PATH` — confirmed in `WebKitWebContext.cpp` (defaults to `PKGLIBDIR/injected-bundle/`, i.e. `/usr/lib/.../webkit2gtk-4.1/injected-bundle/`).
- `WEBKIT_EXEC_PATH` is the analogous override for the directory holding the WebKit subprocess executables. (This is how sandboxed/runtime environments like Flatpak's GNOME runtime point WebKit at a matching helper set — one concrete reason the Flatpak bundle "just works" while the AppImage fails.)

The AppImage bundler handles these paths by **binary-patching `libwebkit*`** in the hook:
```
find "$APPDIR"/usr/lib* -name 'libwebkit*' -exec sed -i -e "s|/usr|././|g" '{}' \;
```
i.e. baked `/usr/lib/...` paths become relative so helpers resolve under `$APPDIR`. If that patch is incomplete, or the helper binaries / `WebKitResources` are missing or at the wrong relative location, the subprocesses fail to spawn → blank window, AppImage-only. The failure signature is exactly `tauri#2689`'s symbol-lookup error and `tauri#15665`(3)'s RUNPATH/SIGBUS mismatch.

Fix: verify `squashfs-root/usr/lib/.../webkit2gtk-4.1/` contains `WebKitWebProcess`, `WebKitNetworkProcess`, `WebKitGPUProcess`, and `WebKitResources/` matching the bundled `libwebkit2gtk`; or force one consistent set via `WEBKIT_EXEC_PATH`/`LD_LIBRARY_PATH` pointing at the AppImage's own helpers.

Sources:
- https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/glib/WebKitWebContext.cpp (`WEBKIT_INJECTED_BUNDLE_PATH`)
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy-plugin-gtk.sh (libwebkit path patch)
- https://github.com/tauri-apps/tauri/issues/2689

## 6. Tauri issues titled around "AppImage white screen / blank window"

No single canonical issue is *literally* titled "AppImage white screen", but these are the ones covering it:

| Issue | Title | State | Resolution |
|---|---|---|---|
| tauri#5143 | `[bug] Blank screen on starting tauri application` | open (upstream) | WebKitGTK bug 180739; workaround `WEBKIT_DISABLE_COMPOSITING_MODE=1` |
| tauri#8254 | `[bug] Empty window, Failed to create GBM device...` | closed (not_planned) | GPU/DMABUF; `WEBKIT_DISABLE_DMABUF_RENDERER=1` |
| tauri#10702 | `[bug] Error 71 (Protocol error) dispatching to Wayland display.` | open (upstream) | NVIDIA; `WEBKIT_DISABLE_DMABUF_RENDERER=1`, `__NV_DISABLE_EXPLICIT_SYNC=1` |
| tauri#11988 | `[bug] AppImages built on Linux Mint do not work for Fedora with Tauri 2.0` | closed (dup of #11994) | White screen, `EGL_BAD_PARAMETER` (see §3) |
| tauri#15665 | `[bug] AppImages from default bundler settings fail on Mesa 25+ distros...` | open | Over-bundled libwayland/glib/gstreamer + stale `GST_PLUGIN_SYSTEM_PATH` in AppRun (§3) |
| tauri#2689 | `` `symbol lookup error` with the `.AppImage` `` | closed | Bundled-vs-system WebKit helper mismatch (§3) |
| tauri#15781 / #15786 | AppImage GTK hook overrides `GDK_BACKEND` | merged (2.12) | Preserve user-set `GDK_BACKEND` (§4) |
| tauri#6172 | Links / `shell::open` don't work from AppImage (xdg-open) | closed | Fixed by "truly portable appimage" PR `tauri#12491` (related, not blank-window) |

## Ranked most-likely root causes

Given: AppImage-only white window, `.deb` + Flatpak fine on the same machine, `WEBKIT_DISABLE_DMABUF_RENDERER=1` already set unconditionally in `main()`.

1. **Over-bundled libraries in the AppImage payload break the WebKit subprocess on this host** — `libwayland-client` + glib family + stale `GST_PLUGIN_SYSTEM_PATH_1_0` in AppRun cause `WebKitWebProcess` to abort at `eglGetDisplay`/GBM/GStreamer init; `.deb`/Flatpak use a consistent system/runtime stack. `WEBKIT_DISABLE_DMABUF_RENDERER` is irrelevant to this failure. (tauri#15665, #11988, #2689)
2. **Bundled-vs-system WebKit helper mismatch / incomplete resource-path patch** — the bundled `libwebkit2gtk` spawns the *system* `WebKitWebProcess`/`WebKitNetworkProcess` (or a missing one) → symbol-lookup error / SIGBUS / no spawn → blank window. (tauri#2689, #15665§3, §5)
3. **AppImage is pinned to X11 by the GTK hook** (`GDK_BACKEND=x11`) while `.deb`/Flatpak run native Wayland → the X11 GBM/DMABUF/compositing path fails on this GPU → blank, sometimes even with DMABUF disabled. (tauri#15781/15786, #9394, #8254, wry#1366)
4. **WebKitGTK bubblewrap sandbox fails inside the AppImage environment** (FUSE mount + user-namespace restrictions) → web subprocesses never start. Fix: `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`. (WebKit source, wry#935, tauri#5130)
5. **WebKitGTK compositing-mode bug under the AppImage's environment** — `WEBKIT_DISABLE_COMPOSITING_MODE=1` as the next flag to try. (tauri#5143, webkit bug 180739)

Diagnostic quick-checks (terminal): run `APPIMAGE_EXTRACT_AND_RUN=1 ./App.AppImage` and watch stderr for `EGL_BAD_PARAMETER`, `symbol lookup error`, `SIGBUS`, `bwrap:`, `Failed to create GBM device`, or `GStreamer element appsink not found`; confirm whether `WebKitWebProcess`/`WebKitNetworkProcess` are alive (`pgrep -af WebKit`); then try, one at a time: `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, `GDK_BACKEND=wayland` (needs tauri ≥2.12 for the hook to honour it), and stripping the bundled infra libs (§3).

Implication for this repo: if reproduced, the AppImage-specific failure means the current ADR 0007/spec assumption ("host-GPU, not packaging") is incomplete for the AppImage target — the fix may need to be bundler-side (exclude the over-bundled libs) rather than (only) the in-binary DMABUF override.
