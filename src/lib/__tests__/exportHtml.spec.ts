import { describe, it, expect, vi } from "vitest";
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

/// The HTML Export assembly contract: one self-contained document that renders
/// correctly standalone — styles embedded, chrome-free render body, no
/// app-specific markup. Image inlining is ticket 03; relative srcs pass
/// through here (they resolve when the file sits beside its assets).
describe("buildExportHtml", () => {
  it("embeds the app and Prism stylesheets inline", () => {
    const html = buildExportHtml("# Hello", "note.md");
    expect(html).toContain("<style>");
    // The bundled stylesheets carry both the Palette tokens and the .md-content
    // typography, plus the Prism token colors.
    expect(html).toContain("--text-color");
    expect(html).toContain(".md-content");
    expect(html).toContain(".token");
  });

  it("renders the content chrome-free: no Sections, no copy buttons", () => {
    const html = buildExportHtml("# A\n\ntext\n\n# B\n\nmore", "note.md");
    expect(html).toContain("<h1>");
    expect(html).not.toContain("md-section");
    expect(html).toContain("more");
  });

  it("escapes the filename in the title", () => {
    const html = buildExportHtml("# Hello", 'a & <b> "c".md');
    expect(html).toContain("<title>a &amp; &lt;b&gt; &quot;c&quot;.md</title>");
  });

  it("uses the filename as the document title", () => {
    expect(buildExportHtml("# Hello", "note.md")).toContain(
      "<title>note.md</title>",
    );
  });

  it("is a standalone document: doctype, charset, one style block", () => {
    const html = buildExportHtml("# Hello", "note.md");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('charset="utf-8"');
    expect(html.match(/<style>/g)?.length).toBe(1);
  });

  it("passes relative image srcs through untouched", () => {
    const html = buildExportHtml("![alt](pic.png)", "note.md");
    expect(html).toContain('src="pic.png"');
  });

  it("wraps the render in a .md-content host so the typography applies", () => {
    const html = buildExportHtml("# Hello", "note.md");
    expect(html).toContain('class="md-content"');
  });
});
