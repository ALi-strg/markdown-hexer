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

describe("Sections (block-anchored)", () => {
  function sectionHtml(markdown: string): Document {
    return new DOMParser().parseFromString(
      renderMarkdown(markdown, { wrapBlocks: true }),
      "text/html",
    );
  }

  it("wraps a heading and everything under it in a collapsible Section", () => {
    const doc = sectionHtml("# A\n\ntext");
    const section = doc.querySelector(".md-section");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("data-section-key")).toBe("h1:A#1");
    const head = section?.querySelector(".md-section-head");
    expect(head?.getAttribute("data-block-index")).toBe("0");
    expect(head?.querySelector(".md-chevron")).not.toBeNull();
    expect(head?.querySelector("h1")?.textContent).toBe("A");
    const body = section?.querySelector(".md-section-body");
    expect(body?.querySelector(".md-block")?.getAttribute("data-block-index")).toBe("1");
    expect(body?.querySelector("p")?.textContent).toBe("text");
  });

  it("gives a contentless heading no Section and no chevron", () => {
    const doc = sectionHtml("# A\n\ntext\n\n## B");
    // "## B" ends the Document with nothing under it.
    const last = doc.body.querySelector('[data-block-index="2"]')!;
    expect(last.classList.contains("md-section-head")).toBe(false);
    expect(last.querySelector(".md-chevron")).toBeNull();
    expect(last.querySelector("h2")?.textContent?.trim()).toBe("B");
    expect(doc.querySelectorAll(".md-section").length).toBe(1);
    expect(doc.querySelector(".md-section")?.getAttribute("data-section-key")).toBe("h1:A#1");
  });

  it("collapses Setext headings into Sections like ATX ones", () => {
    const doc = sectionHtml("Title\n=====\n\ntext");
    expect(doc.querySelector(".md-section")?.getAttribute("data-section-key")).toBe("h1:Title#1");
    expect(doc.querySelector(".md-chevron")).not.toBeNull();
  });

  it("emits the chevron glyph as a real text node, not a CSS pseudo-element", () => {
    const doc = sectionHtml("# A\n\ntext");
    const chevron = doc.querySelector(".md-chevron");
    expect(chevron?.textContent).toBe("\u25B8");
  });

  it("disambiguates duplicate headings by occurrence", () => {
    const doc = sectionHtml("## Setup\n\none\n\n## Setup\n\ntwo");
    const keys = [...doc.querySelectorAll(".md-section")].map((el) =>
      el.getAttribute("data-section-key"),
    );
    expect(keys).toEqual(["h2:Setup#1", "h2:Setup#2"]);
  });
  it("nests Sections, keeps pre-heading content unsectioned, and keeps block indices flat", () => {
    const doc = sectionHtml("intro\n\n# T\n\nbody\n\n## B\n\nmore");
    const section = doc.querySelector(".md-section")!;
    expect(section.getAttribute("data-section-key")).toBe("h1:T#1");
    // Intro paragraph sits at the top level, before the Section.
    const firstBlock = doc.body.querySelector(".md-block");
    expect(firstBlock?.getAttribute("data-block-index")).toBe("0");
    expect(firstBlock?.textContent?.trim()).toBe("intro");
    expect(firstBlock?.closest(".md-section")).toBeNull();
    // Nested Section lives inside the parent's body.
    const nested = section.querySelector(".md-section")!;
    expect(nested.getAttribute("data-section-key")).toBe("h2:B#1");
    expect(nested.parentElement?.closest(".md-section")).toBe(section);
    // Block indices stay flat and sequential across the nesting.
    const indices = [...doc.body.querySelectorAll("[data-block-index]")].map(
      (el) => el.getAttribute("data-block-index"),
    );
    expect(indices).toEqual(["0", "1", "2", "3", "4"]);
  });
});
