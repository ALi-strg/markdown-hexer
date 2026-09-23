# Print Export via the OS print dialog

Technical authors want PDF output of a rendered Document. Programmatic PDF
generation in Rust (headless renderer or a PDF-writing crate) would mean new
heavy dependencies, font/typography work, and a second rendering path that can
drift from the Preview Pane. We instead render a Print Render — an offscreen,
chrome-free render through the same pipeline as the Preview Pane — and hand it
to `window.print()`, where the OS print dialog offers Save-as-PDF on every
supported platform. The app never writes the PDF itself; HTML Export, by
contrast, writes through the normal Save As flow.

## Considered Options

- **OS print dialog over a Print Render (chosen)** — zero new dependencies, one
  rendering path, cross-platform; the tradeoff is the user sees a print dialog
  rather than a one-click file save.
- **Programmatic PDF in Rust** — rejected: heavy deps, duplicate typography
  work, drift risk from the preview pipeline.
- **Tauri print plugin** — rejected: no capability the webview's native print
  lacks, plus a dependency to vet.

## Consequences

- "Export" producing a print dialog rather than a file is deliberate; if users
  chafe at the dialog, the upgrade path is a direct-to-PDF mechanism behind the
  same Print Render, not a change to the trigger.
- The Print Render reuses the preview stylesheet plus a print overlay, so the
  two stay visually in sync; a collapsed Section in the Preview Pane never
  affects an Export.
- HTML Export inlines local images as base64 data URLs at export time — slow
  and large for image-heavy Documents, accepted deliberately (`ponytail:`
  dedupe/size-limit if it matters in practice).
