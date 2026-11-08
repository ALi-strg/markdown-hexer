# Architecture decisions

This is the 2.0 view of the ADR set. Older decisions stay in the repository as history; the sections below say which ones still govern the rewrite.

## Active for 2.0

| ADR | Decision |
|---|---|
| [0004](0004-tag-driven-release-versioning.md) | Tag-driven release versioning — policy remains; the tauri-action implementation is replaced by the native release pipeline |
| [0005](0005-multi-tab-document-model.md) | Multi-Tab workspace — the Tab model remains; Layout Modes are replaced by ADR-0015 |
| [0006](0006-flatpak-bundle-on-github-releases.md) | Flatpak via GitHub Releases — the channel remains; the sandbox rationale must be revisited after ADR-0014 |
| [0009](0009-license-mit.md) | MIT license |
| [0010](0010-contribution-policy.md) | Public repository with closed external contributions |
| [0011](0011-house-design-language.md) | House design language with independent Palettes |
| [0014](0014-rust-native-rewrite-for-cold-start.md) | Rust-native rewrite for cold start |
| [0015](0015-two-mode-document-model.md) | Two-mode document model replacing split view |
| [0016](0016-native-preview-subset.md) | Native preview subset |
| [0017](0017-toolkit-selection.md) | egui 0.37 + glow toolkit selection |

## Deferred

| ADR | Decision |
|---|---|
| [0012](0012-pdf-export-via-print-dialog.md) | Print Export — deferred to 2.1; the `window.print()` mechanism does not survive the webview removal |

## Superseded / historical

| ADR | Superseded by |
|---|---|
| [0001](0001-code-mirror-6-editor-engine.md) | ADR-0014 (native rewrite) |
| [0002](0002-sanitized-rendering-pipeline.md) | ADR-0016 (native preview subset) |
| [0003](0003-single-document-model.md) | ADR-0005 (multi-Tab workspace) |
| [0007](0007-linux-dmabuf-renderer-workaround.md) | ADR-0014 (no WebKitGTK) |
| [0008](0008-linux-titlebar-workaround.md) | ADR-0014 (no Tauri or tao) |
| [0013](0013-windows-gpu-disable.md) | ADR-0014 (no WebView2) |
