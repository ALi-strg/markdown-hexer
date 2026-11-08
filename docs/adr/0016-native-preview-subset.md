# Native preview subset

## Status

Accepted

## Context

2.0 has no webview and no HTML/CSS engine (ADR-0014). Preview is the default Mode, so its renderer is on the startup path. The current Preview renders GFM through `marked`, sanitizes with DOMPurify, and highlights with Prism; none of that survives the rewrite. The owner accepts "same design language, close enough" rather than pixel parity, and raw HTML is not required.

## Decision

Render the Preview natively from a fixed Markdown subset:

- CommonMark plus GFM tables, strikethrough, task lists, and footnotes.
- Headings, paragraphs, emphasis, lists, blockquotes, rules, fenced code with syntax colors, inline code, images, and links.
- Collapsible Sections: every heading starts a Section, with a chevron in the left margin; nested Sections collapse with their parent.
- Copy-on-Select and the Code Copy Button remain.
- No raw HTML, no arbitrary CSS, no embedded scripts. Content outside the subset is shown as text or omitted, never executed.
- The six Palettes drive Preview styling as data; System resolves to Light or Dark. The Design language (ADR-0011) still applies to chrome.
- The prepared preview artifact (`PreparedPreview` plus `RenderTree`) is the renderer seam. If the egui spike succeeds, `egui_commonmark` renders it, with Sections and the Code Copy Button built around it; if not, the same artifact allows another native renderer.
- HTML Export generates a standalone HTML file from the same Markdown or AST, not from the preview widgets, and inlines local images as data URLs.
- Print Export is deferred to 2.1; the 2.0 app has no print path.

## Consequences

The Preview will not match 1.x pixel-for-pixel; spacing, line breaking, and table layout may differ. Documents that rely on raw HTML lose that rendering. The security posture simplifies: there is no script-capable webview and no HTML sanitizer to maintain, but link and image handling still need the Document-directory scope. Syntax highlighting and Section behavior are app-owned. HTML Export needs its own stylesheet and must stay close to the native renderer's Design language. The fidelity bar is a real README fixture with a table, a code block, an image, and nested Sections, checked in every Palette.

## Alternatives considered

- **Embed Servo or Blitz** — rejected: pre-1.0, heavy, and reintroduces a CSS engine and GPU initialization.
- **Keep a hidden webview for Preview** — rejected: reintroduces the webview boot on the default path.
- **Hand-build an HTML/CSS engine** — rejected: far beyond the rewrite's scope.
- **Raw HTML support** — rejected: the owner does not need it; it adds sanitization and layout complexity.
