import { marked, type Token } from "marked";

export const SKIP_BLOCK_TOKEN_TYPES = new Set(["space", "def"]);

export interface BlockRange {
  index: number;
  startLine: number;
  endLine: number;
}

export function computeBlockRanges(source: string): BlockRange[] {
  const tokens = marked.lexer(source);
  const blockTokens: Token[] = [];
  const startLines = new Map<Token, number>();
  let line = 0;
  for (const token of tokens) {
    if (!SKIP_BLOCK_TOKEN_TYPES.has(token.type)) {
      startLines.set(token, line);
      blockTokens.push(token);
    }
    line += countNewlines(token.raw);
  }
  const totalLines = line + 1;
  return blockTokens.map((token, index) => ({
    index,
    startLine: startLines.get(token)!,
    endLine:
      index + 1 < blockTokens.length
        ? startLines.get(blockTokens[index + 1])!
        : totalLines,
  }));
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
