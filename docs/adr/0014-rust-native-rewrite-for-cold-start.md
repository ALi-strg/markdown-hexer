# Rust-native rewrite for cold start

## Status

Accepted

## Context

Markdown Hexer 1.5.0 is a Tauri 2 app: Vue 3 and Pinia in a WebView2, WKWebView, or WebKitGTK webview, CodeMirror 6 for editing, and a Rust shell for file I/O. On the owner's Windows machine a cold start takes roughly 7–10 seconds. Instant startup is the primary requirement for 2.0.

The webview boot is the floor: runtime and process creation happen before app code can paint. A native Rust GUI can present a frame in tens of milliseconds. The blocker is the preview: there is no production-ready Rust HTML/CSS engine. Blitz is beta and its wrapper lacks interactivity; Servo embedding is pre-1.0 and heavy. Keeping HTML fidelity therefore means keeping a webview.

The 1.x line is frozen at 1.5.0. Its installer stays on GitHub Releases, and urgent fixes can ship from a branch cut from the `v1.5.0` tag. 2.0 does not migrate 1.x settings; it starts with fresh preferences.

## Decision

Rewrite Markdown Hexer as a native Rust desktop application with no webview on any code path.

- The GUI toolkit is chosen by a time-boxed spike. egui 0.37 + glow + egui_commonmark is the primary candidate; iced 0.14 is the fallback. The final toolkit choice gets its own ADR after the spike.
- Startup targets, p95 with a warm page cache: Windows first frame with a readable document ≤ 200 ms; Linux readable ≤ 250 ms; macOS first frame with chrome ≤ 200 ms and readable ≤ 250 ms. Windows is the primary gate, Linux second, macOS before release on borrowed hardware. Linux Wayland is a hard gate; X11 is best-effort.
- No wgpu on the startup path. If glow fails on a platform, a wgpu exception is written down and budgeted, never silent.
- License floor: dependencies stay MIT or Apache-2.0 compatible; GPL-only toolkits are excluded.
- Preview is the default Mode and renders a native Markdown subset (ADR-0016).
- The editor is adopted from the toolkit, not rebuilt from CodeMirror. Basic accessibility (AccessKit tree, keyboard focus) is a hard requirement; multi-cursor is dropped for 2.0.
- The rewrite proceeds in the same repository, alongside the frozen 1.x code, after the spike.

## Consequences

The preview is a visual rewrite, not a port: HTML and CSS fidelity are traded for startup (ADR-0016). CodeMirror's multi-cursor and mature editing behavior are not carried over. The WebView2 and WebKitGTK workarounds (ADR-0007, ADR-0008, ADR-0013) retire with the webview. macOS depends on OpenGL through glow, which Apple deprecated in 10.14; it works today but is borrowed time. Packaging and CI must be rebuilt for native bundles. The 7–10 s baseline must be measured and attributed before the 200 ms claim is treated as proven.

## Alternatives considered

- **Keep Tauri and optimize the webview** — rejected: the webview boot is the dominant cost, and the existing `--disable-gpu` workaround removes the compositor fast path.
- **Rust compiled to WASM inside the OS webview** — rejected: same WebView2, WKWebView, or WebKitGTK boot.
- **Native editor with a webview Preview** — rejected: Preview is the default Mode, so the slow runtime would be on the default path.
- **Embed Servo or Blitz** — rejected: pre-1.0, heavy, and still carries a CSS engine and GPU initialization.
