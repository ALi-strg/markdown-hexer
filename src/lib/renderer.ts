import { Marked, type Token, type Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import DOMPurify from "dompurify";
import Prism from "prismjs";
import { SKIP_BLOCK_TOKEN_TYPES } from "./blockMap";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-markdown";

export const HIGHLIGHTED_LANGUAGES = [
  "markup",
  "css",
  "clike",
  "javascript",
  "typescript",
  "python",
  "json",
  "yaml",
  "bash",
  "sql",
  "java",
  "go",
  "markdown",
] as const;

function highlightCode(code: string, lang: string): string {
  const grammar = Prism.languages[lang];
  if (!grammar) {
    return code;
  }
  return Prism.highlight(code, grammar, lang);
}

const marked = new Marked(
  markedHighlight({
    langPrefix: "language-",
    highlight: highlightCode,
  }),
);

export interface RenderOptions {
  wrapBlocks?: boolean;
}

/// Escapes a Section key for use inside a double-quoted HTML attribute.
function escAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/// Whether the Section starting at the heading `blockTokens[start]` (level
/// `level`) contains anything to collapse: any non-heading block until the
/// next heading of the same or higher level. A contentless heading (immediately
/// followed by another heading, or ending the Document) gets no Section.
function subtreeHasContent(
  blockTokens: Token[],
  start: number,
  level: number,
): boolean {
  for (let i = start + 1; i < blockTokens.length; i++) {
    const token = blockTokens[i];
    if (token.type !== "heading") {
      return true;
    }
    if ((token as Tokens.Heading).depth <= level) {
      return false;
    }
  }
  return false;
}

interface SectionFrame {
  level: number;
  key: string;
  head: string;
  body: string[];
}

function renderSection(frame: SectionFrame): string {
  return (
    `<div class="md-section" data-section-key="${escAttr(frame.key)}">` +
    frame.head +
    `<div class="md-section-body">${frame.body.join("")}</div>` +
    `</div>`
  );
}

function headBlock(blockIndex: number, headingHtml: string): string {
  return (
    `<div class="md-block md-section-head" data-block-index="${blockIndex}">` +
    `<button type="button" class="md-chevron" aria-label="Toggle section" aria-expanded="true"></button>` +
    `${headingHtml}</div>`
  );
}

function blockDiv(blockIndex: number, html: string): string {
  return `<div class="md-block" data-block-index="${blockIndex}">${html}</div>`;
}

function renderBlockAnchored(source: string): string {
  const tokens = marked.lexer(source);
  for (const token of tokens) {
    if (token.type === "code") {
      const highlighted = highlightCode(token.text, token.lang);
      if (highlighted !== token.text) {
        token.text = highlighted;
        token.escaped = true;
      }
    }
  }
  const blockTokens = tokens.filter(
    (token) => !SKIP_BLOCK_TOKEN_TYPES.has(token.type),
  );
  // Sections nest: every heading starts one, spanning until the next heading
  // of the same or higher level, so collapsing a heading hides its whole
  // subtree. Keys disambiguate duplicate headings by occurrence (h1:A#2).
  const root: string[] = [];
  const stack: SectionFrame[] = [];
  const occurrences = new Map<string, number>();
  const append = (html: string) => {
    if (stack.length === 0) {
      root.push(html);
    } else {
      stack[stack.length - 1].body.push(html);
    }
  };
  blockTokens.forEach((token, index) => {
    const html = marked.parser([token]);
    if (token.type === "heading") {
      const heading = token as Tokens.Heading;
      while (
        stack.length > 0 &&
        stack[stack.length - 1].level >= heading.depth
      ) {
        append(renderSection(stack.pop()!));
      }
      if (subtreeHasContent(blockTokens, index, heading.depth)) {
        const base = `h${heading.depth}:${heading.text}`;
        const occurrence = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, occurrence);
        stack.push({
          level: heading.depth,
          key: `${base}#${occurrence}`,
          head: headBlock(index, html),
          body: [],
        });
        return;
      }
      append(blockDiv(index, html));
      return;
    }
    append(blockDiv(index, html));
  });
  while (stack.length > 0) {
    append(renderSection(stack.pop()!));
  }
  return DOMPurify.sanitize(root.join(""));
}

export function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): string {
  if (options.wrapBlocks) {
    return renderBlockAnchored(source);
  }
  const rawHtml = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}
