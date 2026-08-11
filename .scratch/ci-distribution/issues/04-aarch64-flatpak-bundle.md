# 04 — aarch64 Flatpak Bundle on every Release

**What to build:** An ARM64 Linux user can install the app via Flatpak too. The ARM64 build job also produces the aarch64 Flatpak Bundle (the same manifest and sandbox as the x86_64 one, ADR 0006) and uploads it as `Markdown-Magic_<version>_linux-aarch64.flatpak` on `v*` tags, with the matching Release body row.

**Blocked by:** 02 — Flatpak Bundle (x86_64) on every Release; 03 — Linux ARM64 Bundles on every Release.

**Status:** ready-for-agent

- [ ] A `v*` tag produces `Markdown-Magic_<version>_linux-aarch64.flatpak` on the Release.
- [ ] It installs with `flatpak install` on an ARM64 GNOME-runtime host and renders a Document with a relative image in the Preview Pane.
- [ ] On PR runs the Flatpak step is skipped entirely; the Release body lists the ARM64 Flatpak option.
