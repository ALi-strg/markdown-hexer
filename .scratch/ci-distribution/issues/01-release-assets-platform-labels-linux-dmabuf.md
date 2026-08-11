# 01 — Release assets gain Platform Labels and the Linux app disables the DMABUF renderer

**What to build:** Two foundation fixes that make every Release trustworthy and every Linux install render correctly.

1. **Asset naming.** After a `v*` tag, every Bundle uploaded to the Release is named `Markdown-Magic_<version>_<platform>-<arch><setup>.<ext>` with a literal Platform Label (`linux` / `macos` / `windows`) — the current unlabeled names (`Markdown-Magic_1.1.2_aarch64.dmg`) disappear. The tauri-action pin moves to `@v1` (which reads `releaseAssetNamePattern`; v0 silently ignored it) and ADR 0004's literal-label patterns are restored on every build job. Historical Releases keep their old names.
2. **Linux rendering.** The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux before the window exists, so the blank/white window on NVIDIA/Wayland hosts (ADR 0007) stops affecting every Linux Bundle.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] A `v*` tag produces a draft Release whose Bundles all carry literal Platform Labels, the correct architecture, and `-setup` for the NSIS installer — no version drift, no unlabeled `Markdown-Magic_<version>_<arch>` assets.
- [x] Non-tag runs (PRs, workflow_dispatch) still pass the unit and E2E gates, create no Release, and upload nothing — behaviour unchanged.
- [x] The app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux before the webview is created; `cargo test`, `npm test`, and the Linux E2E gate stay green.
- [x] Historical Releases (≤ v1.1.2) are untouched.

## Comments

Implemented in `ec61673` (`feat: pin tauri-action to v1 with literal platform labels; disable Linux DMABUF renderer`).

- All three tauri-action steps in `.github/workflows/build.yml` are pinned `@v1`, whose `releaseAssetNamePattern` input is actually read (v0's rename input is `assetNamePattern`; unknown inputs on a JS action are dropped silently). Patterns use literal labels per ADR 0004 — `[platform]` resolves to `darwin` on macOS, so literals are required: `[name]_[version]_linux-[arch][setup][ext]` (e2e job), `[name]_[version]_${{ matrix.label }}-[arch][setup][ext]` (`macos`/`windows`), `[name]_[version]_windows-[arch][setup][ext]` (arm64 job). `[setup]` expands to `-setup` for the NSIS installer; `[arch]` is `x64`/`arm64` on Windows, `aarch64` on macOS, `amd64` (deb/AppImage) and `x86_64` (rpm) on Linux — verified against the pinned action's source. Empty `tagName` on non-tag runs makes v1 skip release creation and all uploads, so PR/workflow_dispatch behaviour is unchanged.
- `src-tauri/src/main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux before `markdown_editor_lib::run()` (ADR 0007), with a Linux-only unit test that runs in the CI `cargo test` step. Verified locally: `cargo test` 33 passed, `npm test` 397 passed.
