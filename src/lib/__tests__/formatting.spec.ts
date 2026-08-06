import { describe, it, expect } from "vitest";
import { formatText } from "../formatting";

describe("formatText", () => {
  describe("bold", () => {
    it("wraps a selection in double asterisks", () => {
      const result = formatText("hello world", { from: 0, to: 5 }, "bold");
      expect(result.changes).toEqual([
        { from: 0, to: 5, insert: "**hello**" },
      ]);
      expect(result.anchor).toBe(0);
      expect(result.head).toBe(9);
    });

    it("inserts a marker pair with the cursor between them on a collapsed cursor", () => {
      const result = formatText("abc", { from: 1, to: 1 }, "bold");
      expect(result.changes).toEqual([{ from: 1, to: 1, insert: "****" }]);
      expect(result.anchor).toBe(3);
      expect(result.head).toBe(3);
    });
  });

  describe("italic", () => {
    it("wraps a selection in single asterisks", () => {
      const result = formatText("hello", { from: 0, to: 5 }, "italic");
      expect(result.changes).toEqual([{ from: 0, to: 5, insert: "*hello*" }]);
      expect(result.anchor).toBe(0);
      expect(result.head).toBe(7);
    });

    it("inserts a marker pair with the cursor between them on a collapsed cursor", () => {
      const result = formatText("abc", { from: 2, to: 2 }, "italic");
      expect(result.changes).toEqual([{ from: 2, to: 2, insert: "**" }]);
      expect(result.anchor).toBe(3);
      expect(result.head).toBe(3);
    });
  });

  describe("heading", () => {
    it("prefixes the current line with a hash", () => {
      const result = formatText("first\nsecond", { from: 8, to: 8 }, "heading");
      expect(result.changes).toEqual([{ from: 6, to: 6, insert: "# " }]);
      expect(result.anchor).toBe(10);
      expect(result.head).toBe(10);
    });

    it("prefixes the line containing the selection start", () => {
      const result = formatText("title", { from: 0, to: 5 }, "heading");
      expect(result.changes).toEqual([{ from: 0, to: 0, insert: "# " }]);
      expect(result.anchor).toBe(2);
      expect(result.head).toBe(7);
    });
  });

  describe("list", () => {
    it("prefixes the current line with a dash", () => {
      const result = formatText("alpha\nbeta", { from: 0, to: 0 }, "list");
      expect(result.changes).toEqual([{ from: 0, to: 0, insert: "- " }]);
      expect(result.anchor).toBe(2);
      expect(result.head).toBe(2);
    });

    it("keeps the selection covering the same text on a selected line", () => {
      const result = formatText("beta", { from: 0, to: 4 }, "list");
      expect(result.changes).toEqual([{ from: 0, to: 0, insert: "- " }]);
      expect(result.anchor).toBe(2);
      expect(result.head).toBe(6);
    });
  });

  describe("link", () => {
    it("wraps a selection as [text](url) and selects the url", () => {
      const result = formatText("docs", { from: 0, to: 4 }, "link");
      expect(result.changes).toEqual([
        { from: 0, to: 4, insert: "[docs](url)" },
      ]);
      expect(result.anchor).toBe(7);
      expect(result.head).toBe(10);
    });

    it("inserts the [text](url) template and selects text on a collapsed cursor", () => {
      const result = formatText("abc", { from: 1, to: 1 }, "link");
      expect(result.changes).toEqual([
        { from: 1, to: 1, insert: "[text](url)" },
      ]);
      expect(result.anchor).toBe(2);
      expect(result.head).toBe(6);
    });
  });

  describe("code", () => {
    it("wraps a single-line selection in inline backticks", () => {
      const result = formatText("const x = 1", { from: 0, to: 11 }, "code");
      expect(result.changes).toEqual([
        { from: 0, to: 11, insert: "`const x = 1`" },
      ]);
      expect(result.anchor).toBe(0);
      expect(result.head).toBe(13);
    });

    it("wraps a multi-line selection in a fenced block", () => {
      const result = formatText("a\nb", { from: 0, to: 3 }, "code");
      expect(result.changes).toEqual([
        { from: 0, to: 3, insert: "```\na\nb\n```" },
      ]);
      expect(result.anchor).toBe(4);
      expect(result.head).toBe(7);
    });

    it("inserts an inline marker pair on a collapsed cursor", () => {
      const result = formatText("abc", { from: 3, to: 3 }, "code");
      expect(result.changes).toEqual([{ from: 3, to: 3, insert: "``" }]);
      expect(result.anchor).toBe(4);
      expect(result.head).toBe(4);
    });
  });
});
