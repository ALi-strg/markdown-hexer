# 02 — Flatpak Bundle (x86_64) on every Release

**What to build:** A Linux user can install the app with `flatpak install` from a single-file Flatpak Bundle attached to a Release. A checked-in manifest and AppStream metainfo (pinned GNOME runtime, `--filesystem=home` sandbox so the `asset://` protocol keeps rendering relative images in the Preview Pane — ADR 0006) wrap the `.deb`. On a `v*` tag the Linux build job produces the bundle and uploads it as `Markdown-Magic_<version>_linux-x86_64.flatpak`, and the Release body lists a Flatpak row.

**Blocked by:** 01 — Release assets gain Platform Labels and the Linux app disables the DMABUF renderer.

**Status:** ready-for-agent

- [ ] A `.flatpak` built from a `.deb` installs (`flatpak install`) and launches; the native Open/Save dialogs work and a Document with a relative image renders it in the Preview Pane.
- [ ] The bundle is version-correct and named `Markdown-Magic_<version>_linux-x86_64.flatpak`.
- [ ] On a `v*` tag the draft Release contains that bundle and its body lists the Flatpak option; on PR runs the Flatpak step is skipped entirely (no build, no upload).
- [ ] The manifest needs no `--env=WEBKIT_DISABLE_*` finish-arg — the DMABUF fix rides inside the binary (ADR 0007).
