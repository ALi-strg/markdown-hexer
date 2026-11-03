# Unconditional `--disable-gpu` in the Windows WebView2

## Decision

The main window in `tauri.conf.json` ships `additionalBrowserArgs` containing
`--disable-gpu`, unconditionally for every Windows user. This lands alongside
the throttling/occlusion flags in the same string; custom args replace wry's
default set, so `msWebOOUI,msPdfOOUI,msSmartScreenProtection` are re-listed.
Because the GPU is off everywhere, the remote-session (RDP) detection code is
not needed and was removed again.

## Why

The app is a text editor: its rendering workload is flat 2D compositing, for
which GPU acceleration buys little. WebView2's GPU process, in contrast, is
the documented source of two defect classes this repo hit in the field:

- Hard, power-cycle-only OS freezes during window resize on a class of Intel
  integrated-graphics machines
  ([WebView2Feedback #3063](https://github.com/MicrosoftEdge/WebView2Feedback/issues/3063),
  [Chromium GPU-process freeze thread](https://groups.google.com/a/chromium.org/g/graphics-dev/c/Qr1qkPJv5lE)).
- Blank-white content over RDP sessions that only repaints on resize
  ([#1115](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1115),
  [#1179](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1179)).

Disabling the GPU process makes behavior uniform across hardware and remote
sessions, the same trade ADR 0007 already made for WebKitGTK's DMABUF path on
Linux. Hardware-name sniffing ("is this an Intel iGPU?") was rejected:
the freeze class is not Arc-specific, and adapter detection drifts with
drivers and breaks on hybrid-GPU laptops where which adapter the WebView2 GPU
process binds to is itself not enumerable reliably.

## Trade-offs

Software rasterization instead of GPU compositing: at-rest rendering for a
1200×800 text pane is indistinguishable; resize/scroll feel may be marginally
less smooth on very large documents. A settings toggle to re-enable GPU
acceleration is deliberately NOT shipped unless real users report smoothness
loss — a silent heuristic is worse than a static flag.
