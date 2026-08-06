import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../renderer";

describe("renderMarkdown", () => {
  it("renders an ATX heading", () => {
    expect(renderMarkdown("# Hello").trim()).toBe("<h1>Hello</h1>");
  });

  it("renders a GFM table", () => {
    const html = renderMarkdown(
      "| a | b |\n|---|---|\n| 1 | 2 |",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders strikethrough", () => {
    expect(renderMarkdown("~~gone~~").trim()).toBe("<p><del>gone</del></p>");
  });

  it("renders a task list with disabled checkboxes", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo");
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('<input disabled="" type="checkbox">');
  });

  it("renders an autolink", () => {
    const html = renderMarkdown("https://example.com");
    expect(html).toContain(
      '<a href="https://example.com">https://example.com</a>',
    );
  });

  it("strips script tags so no script survives the pipeline", () => {
    const html = renderMarkdown("<script>alert(1)</script>ok");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("ok");
  });

  it("strips event-handler attributes", () => {
    const html = renderMarkdown('<p onclick="evil()">hi</p>');
    expect(html).not.toContain("onclick");
    expect(html).toContain("<p>hi</p>");
  });

  it("strips javascript: URLs from links and image error handlers", () => {
    const html = renderMarkdown(
      '<a href="javascript:alert(1)">x</a> <img src=x onerror="evil()">',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<a>x</a>");
  });

  it("does not execute scripts embedded in markdown", () => {
    const html = renderMarkdown('<img src=x onerror="window.__pwned=1">');
    expect(html).not.toContain("onerror");
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});
