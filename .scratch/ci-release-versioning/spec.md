# Spec: Tag-driven release versions and platform-labeled release assets

Status: ready-for-agent

## Problem Statement

Releases are tagged `v1.0.0`–`v1.0.3`, yet every bundle baked the static manifest version `0.1.0` — a `v1.0.3` release ships `Markdown-Magic_0.1.0_*` assets. The GitHub Release assets are also not OS-identifiable by name: the platform only shows up as file extension (`.exe` vs `.dmg` vs `.deb`), and Windows ships both `x64` and `arm64` installers that are easy to mix up.

## Solution

Resolve the Version from the git tag at build time and embed the Platform Label in every uploaded asset name.

- **Version resolution**: on `v*` tag pushes, the version is the tag with the leading `v` stripped (`v1.0.3` → `1.0.3`), injected into the build as `--config {"version": "<version>"}`. Non-tag builds (push to `main`, `workflow_dispatch`) keep the manifest dev baseline (`0.1.0`) and are not overridden. Manifests (`tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`) are never mutated — they keep the dev baseline.
- **Prerelease flag**: `prerelease` on the GitHub release is derived from the tag — true iff the tag contains a semver prerelease segment (e.g. `v1.1.0-rc.1`); stable tags remain `false`.
- **Asset naming**: every `tauri-action` invocation gains `releaseAssetNamePattern: "[name]_[version]_<platform>-[arch][setup][ext]"` with `<platform>` written literally per job: `windows` (both x64 and arm64 jobs), `macos`, `linux`. `[platform]` is not used because it resolves to `darwin`/`linux`. Expected assets for a `v1.0.4` tag:
  - `Markdown-Magic_1.0.4_windows-x64-setup.exe`, `Markdown-Magic_1.0.4_windows-x64.msi`
  - `Markdown-Magic_1.0.4_windows-aarch64-setup.exe`, `Markdown-Magic_1.0.4_windows-aarch64.msi`
  - `Markdown-Magic_1.0.4_macos-aarch64.dmg`, `Markdown-Magic_1.0.4_macos-aarch64.app.tar.gz`
  - `Markdown-Magic_1.0.4_linux-amd64.deb`, `Markdown-Magic_1.0.4_linux-amd64.AppImage`, `Markdown-Magic_1.0.4_linux-x86_64.rpm` (Linux `[arch]` differs per bundle type: `amd64` for deb/AppImage, `x86_64` for rpm — accepted)
- **Release metadata**: `releaseName`/`tagName` keep the raw tag (`v1.0.4`); the release body uses the resolved version.
- **Historical releases** (`v1.0.0`–`v1.0.3`) keep their existing asset names — untouched.

## Acceptance Criteria

1. Pushing tag `v1.0.4` produces a draft Release named `v1.0.4` whose assets are exactly the nine names above (no `0.1.0`, no unnamed assets), and `prerelease: false`.
2. Pushing tag `v1.1.0-rc.1` produces the same naming with version `1.1.0-rc.1` and `prerelease: true`.
3. Pushing to `main` builds as today: version `0.1.0`, no release created, no assets uploaded, CI stays green.
4. All three tauri-action steps (e2e/linux gate, macOS+Windows matrix, Windows arm64) carry the same version override and pattern — a tag build never mixes old and new naming.
5. `productName` is unchanged; MSI upgrade codes are unaffected.

## Notes

- tauri-action `releaseAssetNamePattern` renames at upload time and its dedupe keys on the renamed name, so per-platform names coexist on the same draft release.
- Version override uses inline JSON only (`--config` does not accept `key=value`).
- Do not set the pattern/override on a `[platform]`-based or `productName`-based scheme: the former yields `darwin`, the latter breaks MSI upgrade codes.
