# 03 — Linux ARM64 Bundles on every Release

**What to build:** An ARM64 Linux user can install the app. A new native ARM build job (gated on the Linux E2E gate so a regressed Document lifecycle never ships an ARM Bundle) produces and uploads `.deb`, `.rpm`, and `.AppImage` Bundles for aarch64 to the same draft Release on `v*` tags, named with the Platform Label and the aarch64 architecture per ADR 0004.

**Blocked by:** 01 — Release assets gain Platform Labels and the Linux app disables the DMABUF renderer.

**Status:** ready-for-agent

- [ ] A `v*` tag produces `Markdown-Magic_<version>_linux-arm64.deb`, `Markdown-Magic_<version>_linux-aarch64.rpm`, and `Markdown-Magic_<version>_linux-aarch64.AppImage` on the Release.
- [ ] The ARM job is gated on the Linux E2E gate (runs after it, attaches nothing on PRs).
- [ ] The ARM64 Bundles install and run on an ARM64 Linux host — the AppImage is built natively, not cross-compiled.
