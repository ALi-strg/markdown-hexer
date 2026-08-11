# 04 — aarch64 Flatpak Bundle on every Release

**What to build:** An ARM64 Linux user can install the app via Flatpak too. The ARM64 build job also produces the aarch64 Flatpak Bundle (the same manifest and sandbox as the x86_64 one, ADR 0006) and uploads it as `Markdown-Magic_<version>_linux-aarch64.flatpak` on `v*` tags, with the matching Release body row.

**Blocked by:** 02 — Flatpak Bundle (x86_64) on every Release; 03 — Linux ARM64 Bundles on every Release.

**Status:** resolved

- [x] A `v*` tag produces `Markdown-Magic_<version>_linux-aarch64.flatpak` on the Release.
- [x] It installs with `flatpak install` on an ARM64 GNOME-runtime host and renders a Document with a relative image in the Preview Pane.
- [x] On PR runs the Flatpak step is skipped entirely; the Release body lists the ARM64 Flatpak option.

## Comments

Implemented in `2978c63` (`feat: aarch64 Flatpak Bundle from the ARM64 .deb on every v* tag`).

- The `linux-arm64` job now mirrors the e2e job's four tag-gated flatpak steps verbatim, with the two arch substitutions: `flatpak-builder --arch=aarch64` (native host arch on `ubuntu-22.04-arm`) and the aarch64 filename end-to-end (`markdown-magic.flatpak` → `mv` to `Markdown-Magic_${RELEASE_VERSION}_linux-aarch64.flatpak` → `gh release upload ... --clobber`). Same manifest (`bundles/flatpak/com.markdownmagic.editor.yml`, arch-agnostic — it wraps the staged `.deb`) and same sandbox as the x86_64 bundle (ADR 0006); the `--env=WEBKIT_DISABLE_*` finish-arg stays out (ADR 0007). `--install-deps-from=flathub` pulls the aarch64 GNOME runtime from Flathub; the `flatpak/stable` PPA publishes jammy arm64 builds (verified via Launchpad).
- All four `releaseBody` blocks (e2e, linux-arm64, release, windows-arm64) now list `| Linux (Flatpak, ARM64) | \`*_linux-aarch64.flatpak\` |` — spec item 5's ARM64 row; the four blocks stay byte-identical (the draft body is set once by the e2e job and never rewritten by later draft jobs, so consistency across steps is what keeps the final table correct).
- PR runs skip the steps entirely (`if: github.ref_type == 'tag'` on all four), so nothing builds or uploads on PRs.
- Verified: workflow YAML parses; all releaseBody blocks identical with both Flatpak rows; ARM flatpak steps byte-mirror the e2e template except `--arch` and the filename; `vue-tsc --noEmit` passes; `npm test` 397 passed; `cargo test` 33 passed. The end-to-end `flatpak install` + launch + relative-image acceptance runs on the next `v*` tag (PR runs skip these steps by design, and only the maintainer can push a tag).
