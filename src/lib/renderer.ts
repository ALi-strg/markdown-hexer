import { Marked } from "marked";
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
  const html = blockTokens
    .map(
      (token, index) =>
        `<div class="md-block" data-block-index="${index}">${marked.parser([token])}</div>`,
    )
    .join("");
  return DOMPurify.sanitize(html);
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
