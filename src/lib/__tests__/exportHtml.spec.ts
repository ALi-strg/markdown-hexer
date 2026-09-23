import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildExportHtml } from "../exportHtml";

// Vitest disables CSS processing, so the ?raw stylesheet imports resolve to
// empty strings here. Mock them with representative excerpts — the assembly
// under test only concatenates and embeds them.
vi.mock("../../styles.css?raw", () => ({
  default: ":root { --text-color: #3f3222; }\n.md-content { line-height: 1.7; }",
}));
vi.mock("../../prism-theme.css?raw", () => ({
  default: ".token.keyword { color: var(--syntax-keyword); }",
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockRejectedValue("unreadable");
});

/// The HTML Export assembly contract: one self-contained document that renders
/// correctly standalone — styles embedded, chrome-free render body, no
/// app-specific markup. Image inlining is ticket 03; relative srcs pass
/// through here (they resolve when the file sits beside its assets).
describe("buildExportHtml", () => {
  it("embeds the app and Prism stylesheets inline", async () => {
    const html = await buildExportHtml("# Hello", "note.md", null);
    expect(html).toContain("<style>");
    // The bundled stylesheets carry both the Palette tokens and the .md-content
    // typography, plus the Prism token colors.
    expect(html).toContain("--text-color");
    expect(html).toContain(".md-content");
    expect(html).toContain(".token");
  });

  it("renders the content chrome-free: no Sections, no copy buttons", async () => {
    const html = await buildExportHtml("# A\n\ntext\n\n# B\n\nmore", "note.md", null);
    expect(html).toContain("<h1>");
    expect(html).not.toContain("md-section");
    expect(html).toContain("more");
  });

  it("escapes the filename in the title", async () => {
    const html = await buildExportHtml("# Hello", 'a & <b> "c".md', null);
    expect(html).toContain("<title>a &amp; &lt;b&gt; &quot;c&quot;.md</title>");
  });

  it("uses the filename as the document title", async () => {
    expect(await buildExportHtml("# Hello", "note.md", null)).toContain(
      "<title>note.md</title>",
    );
  });

  it("is a standalone document: doctype, charset, one style block", async () => {
    const html = await buildExportHtml("# Hello", "note.md", null);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('charset="utf-8"');
    expect(html.match(/<style>/g)?.length).toBe(1);
  });

  it("inlines a local image as a data URL read through the scoped command", async () => {
    invokeMock.mockResolvedValue("data:image/png;base64,QUJD");
    const html = await buildExportHtml(
      "![alt](pic.png)",
      "note.md",
      "C:\\notes\\note.md",
    );
    expect(invokeMock).toHaveBeenCalledWith("read_image_data_url", {
      documentPath: "C:\\notes\\note.md",
      imagePath: "C:\\notes\\pic.png",
    });
    expect(html).toContain('src="data:image/png;base64,QUJD"');
    expect(html).not.toContain('src="pic.png"');
  });

  it("leaves remote image URLs untouched", async () => {
    const html = await buildExportHtml(
      "![alt](https://example.com/pic.png)",
      "note.md",
      "C:\notes\note.md",
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(html).toContain('src="https://example.com/pic.png"');
  });

  it("leaves a data-URI image untouched", async () => {
    const html = await buildExportHtml(
      "![alt](data:image/png;base64,AA==)",
      "note.md",
      "C:\notes\note.md",
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(html).toContain('src="data:image/png;base64,AA=="');
  });

  it("omits an unreadable image instead of failing the export", async () => {
    const html = await buildExportHtml(
      "before\n\n![alt](missing.png)\n\nafter",
      "note.md",
      "C:\\notes\\note.md",
    );
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("<img");
    expect(html).toContain("<!doctype html>");
  });

  it("inlines nothing when the Document is Untitled (no directory)", async () => {
    const html = await buildExportHtml("![alt](pic.png)", "note.md", null);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(html).toContain('src="pic.png"');
  });

  it("wraps the render in a .md-content host so the typography applies", async () => {
    const html = await buildExportHtml("# Hello", "note.md", null);
    expect(html).toContain('class="md-content"');
  });
});
