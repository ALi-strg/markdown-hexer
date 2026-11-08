# Toolkit selection: egui 0.37 with glow

## Status

Accepted. Outcome of the ticket 01 framework spike. Measurement details are in
[the 2.0 spike benchmark report](../benchmarks/2.0-spike.md).

## Context

ADR-0014 set the rewrite direction and left the toolkit to a time-boxed spike:
egui 0.37 + glow + egui_commonmark was the candidate, iced 0.14 the fallback,
provided it could meet the same no-wgpu and accessibility rules.

The spike built a throwaway release-profile app outside the repository and
measured it on the owner's Windows machine (Ryzen 7 9800X3D, 61.6 GB RAM,
RTX 4070 Ti SUPER, Samsung 990 PRO NVMe, Windows 11 Pro 10.0.26200, Windows
Defender real-time protection on). It rendered the real README in all six
Palettes plus System, opened a 100 KB / 5,000-line document in Edit, exercised
typing, undo, selection and scrolling, injected CJK composition events, and
dumped the AccessKit tree.

Startup was measured externally over 20 launches: T1 is the first visible
window, T2 is the first frame in which document text is readable. The warm
1.5.0 baseline was built from tag `v1.5.0` and measured with the same script.

| Launch | T1 p50 | T1 p95 | T2 p50 | T2 p95 |
|---|---:|---:|---:|---:|
| Markdown Hexer 1.5.0 (warm) | 5,229 ms | 5,242 ms | 5,267 ms | 5,278 ms |
| egui spike (warm) | 134.8 ms | 151.9 ms | 168.0 ms | 182.5 ms |

A repeat 20-launch egui run measured T2 p95 172.2 ms; the table shows the
slower run. The readable-document gate is 200 ms p95 on Windows; the spike
used 182.5 ms with roughly 5–20 ms of screenshot polling overhead included. The release
binary is 8.84 MB against the 20 MB target. First Edit for a 105,503-byte,
5,000-line document was 136.3 ms p50 / 146.4 ms p95 over 20 runs; typing
p95 stayed at 1.0–1.5 ms and frame times at 6.94 ms p50 / 7.1–7.4 ms p95.

egui_commonmark 0.26 covers the Markdown subset but does not expose block
boundaries or a Code Copy hook. The spike proved that an app-side splitter
using pulldown-cmark offsets can add collapsible Sections and per-block Code
Copy without forking the renderer. The cost is a product-owned preview layer,
not another rendering engine.

## Decision

Use **eframe/egui 0.37 with the glow renderer**, `egui_commonmark` 0.26 for the
Markdown subset, and `egui_extras` for local image loading. AccessKit is
enabled. No wgpu and no webview are on the startup path.

The preview is composed as:

- a `hexer-markdown` layer that splits the source at heading and fenced-code
  boundaries, owns Section identity and collapse state, and rewrites local
  image paths against the document directory;
- `egui_commonmark` for inline styling and block rendering inside each chunk;
- app-rendered Section headers and Code Copy controls around those chunks,
  because the viewer exposes neither.

iced 0.14 is not selected. It defaults to wgpu with a tiny-skia software
fallback; a tiny-skia-only build was not measured here, and the spike produced
no accessibility or preview evidence for it. It stays the fallback only if
egui hits a platform blocker; it is not a co-equal choice.

The toolkit decision is **go**, conditional on clearing the release gates
listed under Open risks. It is not a decision to ship the spike's rough
syntax highlighter, its 28 px heading indent, or its missing table styling.

## Consequences

- Startup and binary-size gates pass with headroom on the measured Windows
  machine. The same process, glow context and first-frame work account for
  about 10 ms inside the app; OS process creation, window mapping and
  presentation account for the rest.
- The preview is a visual rewrite. GFM tables, strikethrough, task lists and
  footnotes render; tables have no cell borders and task checkboxes are
  non-interactive glyphs. Raw HTML is shown as text or omitted, never
  rendered, per ADR-0016.
- Sections and Code Copy are product code. They work in the spike, but the
  splitter must also handle headings inside blockquotes and lists, and the
  Code Copy clipboard must be verified end to end.
- egui's text editor met the 100 KB first-Edit and 60 fps interaction gates
  and its IME event plumbing accepts preedit/commit. It has no multi-cursor,
  and the native IME candidate window was not automated.
- Basic accessibility exists: named links, buttons, labels, an image node and
  a Tab focus path. Heading and table semantics do not: headings and
  chevrons are Buttons, and table/list content flattens to Labels. This is
  the largest product gap in the chosen toolkit.
- The 1.5.0 baseline measured 5.27 s warm, not the owner-reported 7–10 s.
  The owner's number is plausible for a cold WebView2 profile; cold-disk
  startup was not measurable on this non-admin session. The rewrite's
  direction is confirmed either way, with roughly 31× lower readable-startup
  time warm.
- macOS depends on OpenGL through glow (already noted in ADR-0014). Linux
  Wayland and macOS were not measured in this spike.

## Open risks

These are release-blocking verifications, not reasons to reopen the toolkit
choice unless one fails:

1. Linux Wayland and macOS startup, rendering and font fallback. The spec
   makes Wayland a hard gate and macOS a pre-release gate; this machine has
   neither WSL nor macOS hardware.
2. Real CJK IME candidate-window placement and composition. Event injection
   passed; OS-level candidate UI is unverified.
3. Copy-on-Select and clipboard behavior, including Code Copy paste-back.
4. Relative image paths and `file://` scoping. The spike only loaded an
   absolute `file:///` URI; a document-directory resolver is required.
5. AccessKit heading/table/list semantics and a screen-reader pass. egui can
   attach custom AccessKit nodes, but the spike did not implement them.
6. Cold-disk startup. Warm measurements are below budget; the 700 ms cold
   gate remains unmeasured because the session cannot drop the Windows
   standby list.
7. Code syntax colors and link activation. The spike's highlighter is a
   placeholder, and link clicks were not exercised end to end.

## Alternatives considered

- **iced 0.14** — rejected for this decision: wgpu by default with a
  tiny-skia fallback, no measured tiny-skia-only build, and no accessibility
  evidence from this spike to justify a second spike.
- **Keep Tauri/WebView2** — rejected by ADR-0014; the measured 5.27 s warm
  startup leaves no path to a 200 ms readable frame.
- **egui with wgpu** — rejected: no-wgpu is a hard startup rule, and glow met
  the gate.
- **Fork egui_commonmark for Sections and Code Copy** — rejected: an
  app-side splitter already works and keeps the dependency replaceable.
