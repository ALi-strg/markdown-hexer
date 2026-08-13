# Spec: AppImage-only white window on Linux

Status: ready-for-agent

## Problem Statement

A Linux user on **Bazzite (Fedora Atomic-based) 44.20260802**, **AMD GPU**, **Wayland**, x86_64, reports that the **.AppImage Bundle** opens with a white/blank window — only the OS titlebar is visible, the webview content never paints. The same user, same machine, has **no issue with the .deb or the Flatpak Bundle**; only the .AppImage is broken. The affected Bundle is `Markdown-Magic 1.1.3`.

The app already ships the unconditional Linux `WEBKIT_DISABLE_DMABUF_RENDERER=1` override (ADR 0007, present in v1.1.3), yet the AppImage is still white. So the DMABUF-compositor hypothesis (host-GPU, not packaging) does not explain this report, and the root cause must be AppImage-payload-specific.

## Solution

Determine the AppImage-specific root cause on the affected host with an interactive diagnostic wizard (run by a friend of the maintainer, who has the Bazzite machine), then apply the fix that the wizard identifies — most likely baking a second env-var override into the Linux binary in `main.rs`, or, if the evidence implicates the bundled libraries, stripping the over-bundled libraries from the AppImage payload in CI.

Candidates to test, one at a time, against the shipped v1.1.3 AppImage:

1. `APPIMAGE_EXTRACT_AND_RUN=1` (bypass the FUSE mount; the standard escape hatch for subprocess/sandbox pathologies).
2. `WEBKIT_DISABLE_COMPOSITING_MODE=1` — known fix when DOM/JS load but nothing paints (WebKitGTK compositing bug, tauri#5143).
3. `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` — escape hatch for the bubblewrap web-process sandbox failing under the FUSE mount / user-namespace restrictions (tauri#5130, wry#935).
4. GStreamer/`GST_PLUGIN_SYSTEM_PATH_1_0` correction — the AppImage hook exports it to a non-existent bundled dir, killing media setup (tauri#15665).
5. `GDK_BACKEND=wayland` — **requires a rebuilt AppImage to test** (the 2.11.5 GTK hook hard-forces `GDK_BACKEND=x11`, clobbering shell env), because .deb/Flatpak run native Wayland while the AppImage is pinned to XWayland.

The wizard records stderr for the failure signature — `EGL_BAD_PARAMETER`, `symbol lookup error`, `SIGBUS`, `bwrap:`, `Failed to create GBM device`, `GStreamer element appsink not found` — so the chosen fix is evidence-based, not a shot in the dark.

## User Stories

1. As a Linux user on an affected host, I want the .AppImage to render the Editor Pane and Preview Pane, so that the Bundle I downloaded from GitHub Releases actually shows my Markdown.
2. As a Linux user, I want the .AppImage to behave like the .deb and Flatpak Bundle on the same machine, so that any of the three Linux distribution formats is a reliable install path.
3. As a maintainer, I want the diagnostic wizard to test each candidate fix independently and record the failure signature, so that I can identify the real root cause without iterating builds.
4. As a maintainer, I want the wizard to be runnable by a non-engineer (the friend with the machine), so that I can get evidence from a host I have no direct access to.
5. As a maintainer, I want the fix that resolves the wizard's test to be baked into the app unconditionally on Linux, so that future AppImage Bundles carry it without the user setting env vars.
6. As a maintainer, I want the ADR 0007 "host-GPU, not packaging" claim corrected to the actual mechanism once confirmed, so that the rationale in the docs matches reality.
7. As a maintainer, I want the fix to not regress the .deb, .rpm, or Flatpak Bundles, so that one packaging fix does not break the other formats.
8. As a maintainer, I want the fix tracked upstream where applicable (tauri#15665, excludeLibraries), so that the repo can adopt the official bundler fix when it lands.

## Implementation Decisions

- **Diagnostic-first**: do not bake speculative env overrides into `main.rs` before evidence. The wizard runs first; the env var (or payload change) it validates is the one that ships.
- **Where the fix lives — two possible outcomes**:
  1. If an env override resolves it: extend the existing Linux override in `main.rs` (alongside the DMABUF one) with the validated variable. `WEBKIT_DISABLE_COMPOSITING_MODE` and `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS` are the most likely candidates on an AMD/Wayland host.
  2. If stderr implicates the bundled payload (e.g. `EGL_BAD_PARAMETER` from over-bundled `libwayland-client`, or a helper-binary mismatch): strip the over-bundled libraries from the AppImage AppDir in CI. The upstream `bundle.linux.appimage.excludeLibraries` option is **not** in tauri 2.11.5; a CI-side strip step (or adopting a newer tauri that ships it) is the fallback.
- **`GDK_BACKEND=wayland` caveat**: the 2.11.5 linuxdeploy GTK hook exports `GDK_BACKEND=x11` unconditionally. If native Wayland is the fix, it cannot be validated by shell env on the shipped Bundle — a rebuilt AppImage is required, and the fix would be baking `GDK_BACKEND=wayland` into `main.rs` after the hook runs.
- **Do not touch the bundler config until evidence points there**: the .deb/.rpm/Flatpak Bundles work; changing bundle-level settings without a confirmed payload cause risks regressing the formats that currently work.
- **ADR 0007 amendment**: once the root cause is confirmed, amend ADR 0007 to replace its "host-GPU, not packaging" rationale with the actual mechanism, and record whether the fix belongs in the binary or the bundler.

## Testing Decisions

- What makes a good test here: a test must observe the actual webview render on the affected host — anything less (CI E2E under xvfb, `browser.getTitle()`, unit tests) cannot see this class of failure because it is host-GPU/payload dependent.
- **Primary seam (manual, on-host)**: the interactive diagnostic wizard on the Bazzite machine. This is the only place a render can actually be observed. The wizard's "did it render?" answer per candidate is the acceptance test.
- **Secondary seam (existing pattern)**: a Rust unit test on the env-var setter in `main.rs`, mirroring the existing `disables_dmabuf_renderer_on_linux` test, asserting the new override is set on Linux.
- **No new automated seam is proposed** for this bug: CI runs the debug binary under xvfb (X11), never the bundled AppImage, and a payload bug is invisible to the current suite. This gap is accepted and documented rather than papered over with a fragile screenshot test.
- Prior art: `src-tauri/src/main.rs` `#[cfg(test)]` module for the DMABUF env-var test; `docs/agents/issue-tracker.md` for spec publication.

## Out of Scope

- The **Linux titlebar stuck at `Untitled.md`** bug — separate spec (`.scratch/linux-titlebar-window-title/spec.md`), different root cause (tao/Wayland CSD).
- Upstream bundler fixes (tauri#15665, `excludeLibraries`) — tracked, adopted when they ship in a tauri version this repo can use.
- The .deb / .rpm / Flatpak Bundles — they work; the fix must not change their behavior.
- Non-Linux platforms — unaffected.
- Flathub submission — the repo is private (ADR 0006).

## Further Notes

- Reference research: `.scratch/ci-distribution/research-appimage-blank-window.md`.
- v1.1.3 **contains** the DMABUF override (commit `ec61673` is an ancestor of the tag) — confirmed, so the white window is not a missing-override issue.
- The 2.11.5 AppImage GTK hook hard-forces `export GDK_BACKEND=x11` — verified against the tauri v2.11.5 `linuxdeploy-plugin-gtk.sh` source; the .deb/Flatpak run native Wayland on the affected host.
- The wizard will be produced as part of the implementation ticket for this spec (interactive bash, friend-run, logs the failure signature).
- AMD GPU ⇒ the NVIDIA-specific vars (`__NV_DISABLE_EXPLICIT_SYNC`, `__GL_THREADED_OPTIMIZATIONS`) are not candidates here.
