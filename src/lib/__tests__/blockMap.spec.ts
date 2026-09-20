import { describe, it, expect } from "vitest";
import {
  deriveBlocks,
  findBlockIndexForLine,
} from "../blockMap";
import { renderMarkdown } from "../renderer";

describe("deriveBlocks", () => {
  it("maps headings and paragraphs to their source line ranges", () => {
    const ranges = deriveBlocks("# A\n\npara\n\n## B").ranges;
    expect(ranges).toEqual([
      { index: 0, startLine: 0, endLine: 2 },
      { index: 1, startLine: 2, endLine: 4 },
      { index: 2, startLine: 4, endLine: 5 },
    ]);
  });

  it("returns no blocks for an empty Document", () => {
    expect(deriveBlocks("").ranges).toEqual([]);
  });

  it("treats a soft-broken paragraph as one block spanning its lines", () => {
    expect(deriveBlocks("a\nb").ranges).toEqual([
      { index: 0, startLine: 0, endLine: 2 },
    ]);
  });

  it("attributes lines inside a fenced code block to the code block despite rendered height drift", () => {
    const ranges = deriveBlocks(
      "# Intro\n\n```python\ndef f():\n    return 1\n```\n\n# Outro",
    ).ranges;
    expect(ranges).toEqual([
      { index: 0, startLine: 0, endLine: 2 },
      { index: 1, startLine: 2, endLine: 7 },
      { index: 2, startLine: 7, endLine: 8 },
    ]);
    expect(findBlockIndexForLine(ranges, 0)).toBe(0);
    expect(findBlockIndexForLine(ranges, 4)).toBe(1);
    expect(findBlockIndexForLine(ranges, 7)).toBe(2);
  });

  it("maps a representative GFM token stream (task list, table, strikethrough)", () => {
    const source = [
      "# Docs",
      "",
      "- [x] done",
      "- [ ] todo",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "~~gone~~ and text",
    ].join("\n");
    const ranges = deriveBlocks(source).ranges;
    expect(ranges.map((r) => [r.index, r.startLine])).toEqual([
      [0, 0],
      [1, 2],
      [2, 5],
      [3, 9],
    ]);
    expect(findBlockIndexForLine(ranges, 6)).toBe(2);
    expect(findBlockIndexForLine(ranges, 3)).toBe(1);
    expect(findBlockIndexForLine(ranges, 9)).toBe(3);
  });

  it("keeps renderer block indices and scroll-sync ranges on one derivation", () => {
    // "[ref]: /url" lexes as a "def" token and blank lines as "space" tokens —
    // exactly the types SKIP_BLOCK_TOKEN_TYPES skips. The renderer's
    // data-block-index N and the scroll-sync ranges' index N must come from
    // the same kept tokens; a filter change on either side desyncs visibly.
    const source = "intro\n\n[ref]: /url\n\n# T\n\ntext\n\n## B\n\nmore";
    const { keptTokens, ranges } = deriveBlocks(source);
    const doc = new DOMParser().parseFromString(
      renderMarkdown(source, { wrapBlocks: true }),
      "text/html",
    );
    const indices = [...doc.querySelectorAll("[data-block-index]")].map((el) =>
      Number(el.getAttribute("data-block-index")),
    );
    expect(indices).toEqual(keptTokens.map((_, i) => i));
    expect(ranges.map((r) => r.index)).toEqual(keptTokens.map((_, i) => i));
  });
});

describe("findBlockIndexForLine", () => {
  const ranges = [
    { index: 0, startLine: 0, endLine: 2 },
    { index: 1, startLine: 2, endLine: 4 },
    { index: 2, startLine: 4, endLine: 5 },
  ];

  it("returns -1 when there are no blocks", () => {
    expect(findBlockIndexForLine([], 0)).toBe(-1);
  });

  it("attributes a blank line to the preceding block", () => {
    expect(findBlockIndexForLine(ranges, 1)).toBe(0);
    expect(findBlockIndexForLine(ranges, 3)).toBe(1);
  });

  it("clamps lines past the last block to the last block", () => {
    expect(findBlockIndexForLine(ranges, 99)).toBe(2);
  });
});
