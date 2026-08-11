# 03 — Linux ARM64 Bundles on every Release

**What to build:** An ARM64 Linux user can install the app. A new native ARM build job (gated on the Linux E2E gate so a regressed Document lifecycle never ships an ARM Bundle) produces and uploads `.deb`, `.rpm`, and `.AppImage` Bundles for aarch64 to the same draft Release on `v*` tags, named with the Platform Label and the aarch64 architecture per ADR 0004.

**Blocked by:** 01 — Release assets gain Platform Labels and the Linux app disables the DMABUF renderer.

**Status:** resolved

- [x] A `v*` tag produces `Markdown-Magic_<version>_linux-arm64.deb`, `Markdown-Magic_<version>_linux-aarch64.rpm`, and `Markdown-Magic_<version>_linux-aarch64.AppImage` on the Release.
- [x] The ARM job is gated on the Linux E2E gate (runs after it, attaches nothing on PRs).
- [x] The ARM64 Bundles install and run on an ARM64 Linux host — the AppImage is built natively, not cross-compiled.

## Comments

Implemented in `0a8bf0f` (`feat: native linux-arm64 bundles (.deb/.rpm/.AppImage) on every v* tag`).

- New `linux-arm64` job in `.github/workflows/build.yml`: `runs-on: ubuntu-22.04-arm` (GitHub's native arm64 runner — ARM AppImages cannot be cross-compiled, linuxdeploy limitation), `needs: e2e`, `permissions: contents: write`. Mirrors the `release` job's setup (checkout, tag version resolution, Linux build deps, setup-node, rust-toolchain, rust-cache, `npm ci`, frontend + rust unit tests), then tauri-action `@v1` with the e2e job's exact inputs: `releaseAssetNamePattern: "[name]_[version]_linux-[arch][setup][ext]"`, `args: --config .release-version.json` on tags, empty `tagName` otherwise. On PR runs it builds the bundles but creates no Release and uploads nothing (same empty-tagName convention as every other job); on `v*` tags it uploads into the draft Release created by the e2e job (draft bodies are never overwritten by later jobs — verified in tauri-action `create-release.ts` — and all four tauri-action steps carry the identical body).
- Naming verified against the pinned action's source (`tauri-apps/tauri-action@v1` = action-v1.0.0): on an `arm64` host `getTargetInfo()` yields `{arch: arm64, platform: linux}`, and the per-bundle arch mapping resolves `[arch]` to `arm64` for the `.deb`, `aarch64` for the `.rpm` and `.AppImage`; `[setup]` is `''` for every non-NSIS bundle. The single pattern therefore produces exactly `Markdown-Magic_<version>_linux-arm64.deb`, `Markdown-Magic_<version>_linux-aarch64.rpm`, `Markdown-Magic_<version>_linux-aarch64.AppImage`.
- The aarch64 Flatpak Bundle is NOT in this job yet — it is ticket 04 (blocked by this one), which will add the flatpak steps to this same job and the ARM64 Flatpak release-body row. No `webkit2gtk-driver` apt dependency — that is only needed to *run* the E2E suite, which this job is gated on, not executing.
- Verified: workflow YAML parses; `linux-arm64` job inputs are byte-identical to the e2e job's tauri-action step (pattern/args/draft/tagName/body); `vue-tsc --noEmit` passes; `npm test` 397 passed; `cargo test` 33 passed. The end-to-end ARM64 install-and-run acceptance happens on the next `v*` tag (only the maintainer can push a tag; PR runs skip release attachment by design).
