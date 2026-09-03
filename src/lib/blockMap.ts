import { marked, type Token } from "marked";

export const SKIP_BLOCK_TOKEN_TYPES = new Set(["space", "def"]);

export interface BlockRange {
  index: number;
  startLine: number;
  endLine: number;
}

/// The single lex pass shared by every block-anchored consumer: filters the
/// skipped token types once and yields both the kept tokens (the renderer
/// numbers its `data-block-index` anchors by their position here) and the
/// source line ranges Synced Scrolling maps editor lines onto. The two views
/// agree by construction — a filtering change on either side is impossible.
export function deriveBlocks(source: string): {
  keptTokens: Token[];
  ranges: BlockRange[];
} {
  const tokens = marked.lexer(source);
  const keptTokens: Token[] = [];
  const startLines = new Map<Token, number>();
  let line = 0;
  for (const token of tokens) {
    if (!SKIP_BLOCK_TOKEN_TYPES.has(token.type)) {
      startLines.set(token, line);
      keptTokens.push(token);
    }
    line += countNewlines(token.raw);
  }
  const totalLines = line + 1;
  const ranges = keptTokens.map((token, index) => ({
    index,
    startLine: startLines.get(token)!,
    endLine:
      index + 1 < keptTokens.length
        ? startLines.get(keptTokens[index + 1])!
        : totalLines,
  }));
  return { keptTokens, ranges };
}

export function findBlockIndexForLine(
  ranges: BlockRange[],
  line: number,
): number {
  let lo = 0;
  let hi = ranges.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].startLine <= line) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}
