import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import DOMPurify from "dompurify";
import Prism from "prismjs";
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

export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}
