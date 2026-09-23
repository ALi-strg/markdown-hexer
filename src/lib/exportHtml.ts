/// HTML Export: assembles one self-contained `.html` file from a Document's
/// render — the app and Prism stylesheets inlined, chrome-free render body
/// (same pipeline as the Preview Pane and the Print Render, block wrapping
/// off). The exported file renders correctly on its own in any browser
/// (CONTEXT.md, ## Export). Image inlining is a later slice (ticket 03);
/// relative image srcs pass through and resolve when the file is exported
/// beside its assets — the default save path.

import { renderMarkdown } from "./renderer";
import appStyles from "../styles.css?raw";
import prismStyles from "../prism-theme.css?raw";

/// The app's own stylesheets, bundled verbatim at build time: always in sync
/// with the app's look by construction, no runtime CSSOM reading. App-chrome
/// rules (toolbar, editor, toast) are dead selectors in the export — harmless.
const EXPORT_STYLES = `${appStyles}\n${prismStyles}`;

/// Escapes a string for safe embedding in HTML text content.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/// Builds the standalone HTML document: `<style>`-inlined stylesheets, the
/// filename as title, and the chrome-free render wrapped in a .md-content host
/// so the shared content typography applies.
export function buildExportHtml(content: string, title: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    EXPORT_STYLES,
    "</style>",
    "</head>",
    '<body><div class="md-content" style="padding: var(--pane-padding);">',
    renderMarkdown(content),
    "</div></body>",
    "</html>",
  ].join("\n");
}
