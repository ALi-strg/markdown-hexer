# Spec: CI distribution — Flatpak bundles, Linux ARM, asset naming, Linux DMABUF fix

Status: ready-for-agent

## Problem Statement

Four related gaps in the CI distribution story:

1. **GitHub Release assets carry no Platform Label** — e.g. `Markdown-Magic_1.1.2_aarch64.dmg`. ADR 0004 documents the intended `Markdown-Magic_<version>_<platform>-<arch><setup>.<ext>` naming, but the workflow pins `tauri-action@v0`, whose rename input is `assetNamePattern`; the `releaseAssetNamePattern` used in `build.yml` only exists in tauri-action v1.x, so unknown-inputs-are-dropped means the rename never applied and assets keep Tauri's default bundle names.
2. **No Flatpak Bundle** — Linux users only get `.deb`/`.rpm`/`.AppImage`. Distribution should include a single-file `.flatpak` installable with `flatpak install`.
3. **Linux bundles are x86_64-only** — no aarch64 variants.
4. **The `.AppImage` opens blank/white on some Linux hosts** — WebKitGTK's DMABUF renderer vs host GPU (most often NVIDIA, also Wayland), tauri-apps/tauri#9394. The report was mis-attributed to the AppImage; the defect is host-GPU, so the fix is an unconditional Linux override in the binary (ADR 0007), not packaging.

## Solution

### 1. Asset naming

- Replace `tauri-apps/tauri-action@v0` with `tauri-apps/tauri-action@v1` in all three steps (e2e/linux, `release` matrix, windows arm64).
- Restore ADR 0004's literal-platform patterns:
  - e2e/linux job: `[name]_[version]_linux-[arch][setup][ext]` (unchanged)
  - `release` matrix job: `[name]_[version]_${{ matrix.label }}-[arch][setup][ext]` (label is `macos` / `windows`)
  - windows arm64 job: `[name]_[version]_windows-[arch][setup][ext]`
- Historical releases (≤ `v1.1.2`) keep their asset names — untouched.

### 2. Linux DMABUF override

- In `src-tauri/src/main.rs`, before the `run()` call:

```rust
fn main() {
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    markdown_editor_lib::run()
}
```

### 3. Flatpak Bundle (x86_64)

- Checked-in `bundles/flatpak/com.markdownmagic.editor.yml` (manifest) + `bundles/flatpak/com.markdownmagic.editor.metainfo.xml`, modelled on Tauri's Flathub guide (a `binary` module, `buildsystem: simple`, that extracts the `.deb` and installs binary, desktop file, icons, metainfo).
  - `id: com.markdownmagic.editor` (matches the app `identifier`), `command: markdown-editor` (the mainBinaryName).
  - Runtime pinned to one stable release: `runtime: org.gnome.Platform`, `runtime-version: <current stable, e.g. 47>`, `sdk: org.gnome.Sdk`.
  - `finish-args`: `--socket=wayland`, `--socket=fallback-x11`, `--device=dri`, `--share=ipc`, `--filesystem=home` (see ADR 0006 — the `asset://` protocol must read images next to an opened Document).
  - Do **not** add `--env=WEBKIT_DISABLE_*`: the DMABUF override is baked into the binary (item 2).
- In the `e2e` (ubuntu) job, after the tauri-action step, add `if: github.ref_type == 'tag'` steps:
  - copy the built `.deb` to `bundles/flatpak/markdown-magic.deb` (stable name, so the manifest's `type: file` source is version-independent)
  - ensure `flatpak` + `flatpak-builder` are installed (`sudo apt-get install -y flatpak flatpak-builder`; the runner image has `flatpak` but `flatpak-builder` may be missing)
  - run `flatpak/flatpak-github-actions/flatpak-builder@master` with `manifest-path: bundles/flatpak/com.markdownmagic.editor.yml`, `bundle: markdown-magic.flatpak`, `upload-artifact: false` (runtime/SDK come from the manifest)
  - upload `markdown-magic.flatpak` to the draft release as `Markdown-Magic_${{ env.RELEASE_VERSION }}_linux-x86_64.flatpak` via `actions/upload-release-asset` (`GITHUB_TOKEN`, `release_id` = the `releaseId` output of the e2e job's tauri-action step — give that step an `id:` so the output is referenceable).

### 4. Linux ARM64

- New job `linux-arm64`: `runs-on: ubuntu-22.04-arm`, `needs: e2e`, `permissions: contents: write`. Mirror the `release` job's setup (checkout, resolve release version from tag, install Linux build deps, setup-node, rust-toolchain, rust-cache, `npm ci`, frontend + rust unit tests), then:
  - tauri-action `@v1` with pattern `[name]_[version]_linux-[arch][setup][ext]`, `args` including `--config .release-version.json` on tags (identical version handling to the other jobs)
  - Flatpak Bundle for aarch64: same steps as item 3, with the flatpak-builder action's `arch: aarch64`; upload as `Markdown-Magic_${{ env.RELEASE_VERSION }}_linux-aarch64.flatpak`
- Expected aarch64 names: `Markdown-Magic_<version>_linux-arm64.deb`, `Markdown-Magic_<version>_linux-aarch64.rpm`, `Markdown-Magic_<version>_linux-aarch64.AppImage`, `Markdown-Magic_<version>_linux-aarch64.flatpak`.

### 5. Release metadata

- Add "Linux (Flatpak)" rows — x86_64 and ARM64 — to all three `releaseBody` blocks (e2e job, `release` job, windows arm64 job).

## Acceptance Criteria

1. Tag `v1.1.3` produces a draft Release whose assets match the ADR 0004 names for windows x64 + arm64 (`*_windows-x64-setup.exe`, `*_windows-arm64-setup.exe`, `*.msi`), macOS (`*_macos-aarch64.dmg`, `*.app.tar.gz`), and Linux amd64 (`*_linux-amd64.deb`, `*_linux-amd64.AppImage`, `*_linux-x86_64.rpm`) — no `0.1.0` anywhere, no unlabeled `Markdown-Magic_<version>_<arch>` names.
2. The same Release includes `Markdown-Magic_1.1.3_linux-x86_64.flatpak` plus, from the `linux-arm64` job, `Markdown-Magic_1.1.3_linux-arm64.deb`, `Markdown-Magic_1.1.3_linux-aarch64.rpm`, `Markdown-Magic_1.1.3_linux-aarch64.AppImage`, `Markdown-Magic_1.1.3_linux-aarch64.flatpak`.
3. `flatpak install Markdown-Magic_1.1.3_linux-x86_64.flatpak` on a GNOME-runtime host launches the app; Open/Save native dialogs work; a Markdown document with a relative image renders that image in the Preview Pane.
4. `npm test`, `cargo test`, and the E2E suite stay green; the `linux-arm64` job is gated on `e2e` (a regressed Document lifecycle never ships an aarch64 installer either).
5. On a Linux host affected by the DMABUF blank/white window, the `.AppImage` and `.deb` now render content.
6. Historical releases (≤ `v1.1.2`) are untouched.

## Notes

- tauri-action v1's input is `releaseAssetNamePattern`; v0 used `assetNamePattern`. Unknown inputs on a JavaScript action are silently ignored — the root cause of the unlabeled assets (see amended ADR 0004).
- The `[platform]` placeholder resolves to `darwin` on macOS; literal labels are required to produce `macos` (ADR 0004).
- `[bundle]` should not appear in `releaseAssetNamePattern` — it conflicts with `[ext]` (e.g. `*_dmg.dmg`, `*_nsis.exe`); `[setup]` is the right way to mark the NSIS installer (`-setup`).
- The flatpak-builder action (`flatpak/flatpak-github-actions`, dir `flatpak-builder`) reads runtime/SDK from the manifest; `arch` defaults to `x86_64` and must be set to `aarch64` on the ARM job. It stages `type: file` sources into the build sandbox, so the local `.deb` copy works.
- The flatpak manifest's build-commands must reference the real paths inside the produced `.deb` (binary `markdown-editor`, desktop `markdown-magic.desktop`, hicolor icons, metainfo) — inspect `src-tauri/target/release/bundle/deb/` after a build and adjust.
- ARM AppImages cannot be cross-compiled (linuxdeploy limitation); the native `ubuntu-22.04-arm` runner is required.
- The repo is private — do not attempt Flathub submission (ADR 0006).
- Reference documents: ADR 0004 (asset naming, version resolution), ADR 0006 (Flatpak via GitHub Releases), ADR 0007 (Linux DMABUF override), Tauri docs `distribute/flatpak` + `distribute/appimage` + `develop/debug/linux-graphics`.
