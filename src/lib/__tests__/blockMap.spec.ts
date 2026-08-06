import { describe, it, expect } from "vitest";
import {
  computeBlockRanges,
  findBlockIndexForLine,
} from "../blockMap";

describe("computeBlockRanges", () => {
  it("maps headings and paragraphs to their source line ranges", () => {
    const ranges = computeBlockRanges("# A\n\npara\n\n## B");
    expect(ranges).toEqual([
      { index: 0, startLine: 0, endLine: 2 },
      { index: 1, startLine: 2, endLine: 4 },
      { index: 2, startLine: 4, endLine: 5 },
    ]);
  });

  it("returns no blocks for an empty Document", () => {
    expect(computeBlockRanges("")).toEqual([]);
  });

  it("treats a soft-broken paragraph as one block spanning its lines", () => {
    expect(computeBlockRanges("a\nb")).toEqual([
      { index: 0, startLine: 0, endLine: 2 },
    ]);
  });

  it("attributes lines inside a fenced code block to the code block despite rendered height drift", () => {
    const ranges = computeBlockRanges(
      "# Intro\n\n```python\ndef f():\n    return 1\n```\n\n# Outro",
    );
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
    const ranges = computeBlockRanges(source);
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
