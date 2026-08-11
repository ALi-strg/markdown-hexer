# 01 — Release assets gain Platform Labels and the Linux app disables the DMABUF renderer

**What to build:** Two foundation fixes that make every Release trustworthy and every Linux install render correctly.

1. **Asset naming.** After a `v*` tag, every Bundle uploaded to the Release is named `Markdown-Magic_<version>_<platform>-<arch><setup>.<ext>` with a literal Platform Label (`linux` / `macos` / `windows`) — the current unlabeled names (`Markdown-Magic_1.1.2_aarch64.dmg`) disappear. The tauri-action pin moves to `@v1` (which reads `releaseAssetNamePattern`; v0 silently ignored it) and ADR 0004's literal-label patterns are restored on every build job. Historical Releases keep their old names.
2. **Linux rendering.** The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux before the window exists, so the blank/white window on NVIDIA/Wayland hosts (ADR 0007) stops affecting every Linux Bundle.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A `v*` tag produces a draft Release whose Bundles all carry literal Platform Labels, the correct architecture, and `-setup` for the NSIS installer — no version drift, no unlabeled `Markdown-Magic_<version>_<arch>` assets.
- [ ] Non-tag runs (PRs, workflow_dispatch) still pass the unit and E2E gates, create no Release, and upload nothing — behaviour unchanged.
- [ ] The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux before the webview is created; `cargo test`, `npm test`, and the Linux E2E gate stay green.
- [ ] Historical Releases (≤ v1.1.2) are untouched.
