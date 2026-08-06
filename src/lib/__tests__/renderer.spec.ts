import { describe, it, expect } from "vitest";
import { renderMarkdown, HIGHLIGHTED_LANGUAGES } from "../renderer";

const SNIPPETS: Record<string, string> = {
  markup: "<div>hi</div>",
  css: "body { color: red; }",
  clike: "if (true) {}",
  javascript: "const x = 1;",
  typescript: "const x: number = 1;",
  python: "import os",
  json: '{"a": 1}',
  yaml: "a: 1",
  bash: "echo hi",
  sql: "SELECT * FROM t",
  java: "class A {}",
  go: "package main",
  markdown: "**bold**",
};

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

  it("keeps a relative image src untouched for the Preview Pane to resolve", () => {
    const html = renderMarkdown("![pic](images/pic.png)");
    expect(html).toContain('<img src="images/pic.png"');
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

  it("highlights a fenced code block with Prism classes in the same render pass", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain('class="language-js"');
    expect(html).toContain('<span class="token keyword">const</span>');
  });

  it.each(HIGHLIGHTED_LANGUAGES)(
    "highlights fenced %s blocks with Prism classes",
    (lang) => {
      const html = renderMarkdown(`\`\`\`${lang}\n${SNIPPETS[lang]}\n\`\`\``);
      expect(html).toContain(`class="language-${lang}"`);
      expect(html).toMatch(/class="token[ "]|class="token\b/);
    },
  );

  it("falls back to escaped plain text for unknown languages", () => {
    const html = renderMarkdown("```klingon\n<script>alert(1)</script>\n```");
    expect(html).toContain('class="language-klingon"');
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("alert(1)");
  });

  it("keeps highlighted fenced code sanitized", () => {
    const html = renderMarkdown("```html\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script");
    expect(html).toContain("token");
    expect(html).toContain("alert");
  });

  it("wraps each block with a sequential data-block-index anchor", () => {
    const html = renderMarkdown("# A\n\npara", { wrapBlocks: true });
    expect(html).toContain('class="md-block"');
    expect(html).toContain('data-block-index="0"');
    expect(html).toContain('data-block-index="1"');
    expect(html).not.toContain('data-block-index="2"');
  });

  it("keeps Prism highlighting inside wrapped code blocks", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```", {
      wrapBlocks: true,
    });
    expect(html).toContain('data-block-index="0"');
    expect(html).toContain("token keyword");
    expect(html).toContain('class="language-js"');
  });

  it("sanitizes wrapped block output", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\npara", {
      wrapBlocks: true,
    });
    expect(html).not.toContain("<script");
    expect(html).toContain('data-block-index="0"');
    expect(html).toContain("para");
  });
});
