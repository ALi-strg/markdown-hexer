/// HTML Export: assembles one self-contained `.html` file from a Document's
/// render — the app and Prism stylesheets inlined, chrome-free render body
/// (same pipeline as the Preview Pane and the Print Render, block wrapping
/// off), local images embedded as base64 data URLs. The exported file renders
/// correctly on its own in any browser, even on a machine without the source
/// images (CONTEXT.md, ## Export). Remote (http/https) image URLs pass
/// through untouched.

import { renderMarkdown } from "./renderer";
import { assetBase, isExternalSrc, resolveAssetSrc } from "./assetUrl";
import { invoke } from "@tauri-apps/api/core";
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

/// Rewrites every local image in `host` to a base64 data URL read through the
/// scoped `read_image_data_url` command — the same Document-directory scope
/// the `asset://` protocol enforces. Remote (http/https) and other external
/// srcs pass through untouched. An unreadable or missing image degrades
/// gracefully: it is omitted, never failing the export.
///
/// ponytail: one file read per image, every export, no dedupe or size limit —
/// image-heavy Documents export slowly and large; dedupe/limit when that
/// matters in practice (ADR 0012 Consequences).
export async function inlineImages(
  host: Element,
  canonicalPath: string | null,
): Promise<void> {
  const base = assetBase(canonicalPath);
  if (base === null) {
    return;
  }
  for (const img of host.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src === null || isExternalSrc(src)) {
      continue;
    }
    const absolute = resolveAssetSrc(src, base);
    if (absolute === null) {
      continue;
    }
    try {
      img.setAttribute(
        "src",
        await invoke("read_image_data_url", {
          documentPath: canonicalPath,
          imagePath: absolute,
        }),
      );
    } catch {
      img.remove();
    }
  }
}

/// Builds the standalone HTML document: `<style>`-inlined stylesheets, the
/// filename as title, and the chrome-free render wrapped in a .md-content host
/// so the shared content typography applies.
export async function buildExportHtml(
  content: string,
  title: string,
  canonicalPath: string | null,
): Promise<string> {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(content);
  await inlineImages(host, canonicalPath);
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
    '<body><div class="md-content">',
    host.innerHTML,
    "</div></body>",
    "</html>",
  ].join("\n");
}
