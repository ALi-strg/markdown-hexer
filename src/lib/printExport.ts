/// Print Export: mounts an offscreen Print Render of the Active Document and
/// hands it to the OS print dialog via window.print(). The Print Render is the
/// same render pipeline as the Preview Pane with block wrapping off — no
/// Sections, no collapse state, no preview chrome (CONTEXT.md, ## Export).

import { renderMarkdown } from "./renderer";
import { rewriteAssetSrcs } from "./assetUrl";

/// One render per print request, never cached: the print dialog is modal, so
/// the user can only re-print with fresh state.
let printHost: HTMLElement | null = null;

/// Mounts the Print Render into a fresh container (or reuses the live one from
/// a synchronous re-entry while a print dialog is open) and opens the OS print
/// dialog. The container carries the print-overlay styling; the render itself
/// is the plain preview output, so a print stylesheet can target it directly.
export function printDocument(
  content: string,
  canonicalPath: string | null,
  doc: Document,
): void {
  let host = printHost;
  if (host === null) {
    host = doc.createElement("div");
    host.className = "print-render";
    doc.body.appendChild(host);
    printHost = host;
  }
  host.innerHTML = renderMarkdown(content);
  rewriteAssetSrcs(host, canonicalPath);
  doc.defaultView?.print();
}

/// Tears the Print Render container down: called after the print call so the
/// offscreen DOM never lingers between prints.
export function teardownPrintRender(): void {
  printHost?.remove();
  printHost = null;
}
