/// Print Export: mounts an offscreen Print Render of the Active Document and
/// hands it to the OS print dialog via window.print(). The Print Render is the
/// same render pipeline as the Preview Pane with block wrapping off — no
/// Sections, no collapse state, no preview chrome (CONTEXT.md, ## Export).

import { renderMarkdown } from "./renderer";
import { rewriteAssetSrcs } from "./assetUrl";

/// The Print Render container lives until the print dialog closes (the
/// `afterprint` signal), because window.print() does not block on every
/// engine: Chromium (WebView2) blocks, but the WebKit family (WKWebView,
/// WebKitGTK) returns before the dialog closes — an immediate teardown there
/// would remove the content before it is spooled. A lingering container is
/// harmless (display:none) and is reused by the next print.
let printHost: HTMLElement | null = null;
let afterprintTeardown: (() => void) | null = null;

/// Mounts the Print Render into a fresh container (or reuses the live one from
/// a re-entry while a print dialog is still open) and opens the OS print
/// dialog. The container carries the print-overlay styling; the render itself
/// is the plain preview output, so a print stylesheet can target it directly.
export function printDocument(content: string, canonicalPath: string | null): void {
  const doc = globalThis.document;
  let host = printHost;
  if (host === null) {
    host = doc.createElement("div");
    host.className = "print-render md-content";
    doc.body.appendChild(host);
    printHost = host;
  }
  host.innerHTML = renderMarkdown(content);
  rewriteAssetSrcs(host, canonicalPath);
  if (afterprintTeardown === null) {
    afterprintTeardown = () => teardownPrintRender();
    doc.defaultView?.addEventListener("afterprint", afterprintTeardown);
  }
  doc.defaultView?.print();
}

/// Tears the Print Render container down. Fired by the `afterprint` event —
/// the cross-engine signal that the print dialog closed (saved, printed, or
/// cancelled). The listener removes itself; a subsequent print starts fresh.
export function teardownPrintRender(): void {
  printHost?.remove();
  printHost = null;
  if (afterprintTeardown !== null) {
    globalThis.window?.removeEventListener("afterprint", afterprintTeardown);
    afterprintTeardown = null;
  }
}
