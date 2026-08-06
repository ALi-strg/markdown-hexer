import type { ChangeSpec } from "@codemirror/state";

export type FormatOperation =
  | "bold"
  | "italic"
  | "heading"
  | "list"
  | "link"
  | "code";

export interface FormatSelection {
  from: number;
  to: number;
}

export interface FormatChange {
  changes: ChangeSpec[];
  /// The selection/cursor position after the changes are applied.
  anchor: number;
  head: number;
}

function lineStart(text: string, pos: number): number {
  const nl = text.lastIndexOf("\n", pos - 1);
  return nl + 1;
}

/// Wraps a selection in `prefix`/`suffix`; on a collapsed cursor inserts the
/// marker pair and places the cursor between them.
function wrap(
  text: string,
  sel: FormatSelection,
  prefix: string,
  suffix: string,
): FormatChange {
  if (sel.from < sel.to) {
    const insert = prefix + text.slice(sel.from, sel.to) + suffix;
    return {
      changes: [{ from: sel.from, to: sel.to, insert }],
      anchor: sel.from,
      head: sel.from + insert.length,
    };
  }
  return {
    changes: [{ from: sel.from, to: sel.to, insert: prefix + suffix }],
    anchor: sel.from + prefix.length,
    head: sel.from + prefix.length,
  };
}

/// Prefixes the line containing the selection start, keeping the selection on
/// the same text.
function prefixCurrentLine(
  text: string,
  sel: FormatSelection,
  prefix: string,
): FormatChange {
  const start = lineStart(text, sel.from);
  return {
    changes: [{ from: start, to: start, insert: prefix }],
    anchor: sel.from + prefix.length,
    head: sel.to + prefix.length,
  };
}

function bold(text: string, sel: FormatSelection): FormatChange {
  return wrap(text, sel, "**", "**");
}

function italic(text: string, sel: FormatSelection): FormatChange {
  return wrap(text, sel, "*", "*");
}

function heading(text: string, sel: FormatSelection): FormatChange {
  return prefixCurrentLine(text, sel, "# ");
}

function list(text: string, sel: FormatSelection): FormatChange {
  return prefixCurrentLine(text, sel, "- ");
}

function link(text: string, sel: FormatSelection): FormatChange {
  if (sel.from < sel.to) {
    const insert = `[${text.slice(sel.from, sel.to)}](url)`;
    const urlStart = sel.from + insert.length - 4;
    return {
      changes: [{ from: sel.from, to: sel.to, insert }],
      anchor: urlStart,
      head: urlStart + 3,
    };
  }
  const insert = "[text](url)";
  return {
    changes: [{ from: sel.from, to: sel.to, insert }],
    anchor: sel.from + 1,
    head: sel.from + 5,
  };
}

function code(text: string, sel: FormatSelection): FormatChange {
  if (sel.from < sel.to) {
    const selected = text.slice(sel.from, sel.to);
    if (selected.includes("\n")) {
      const insert = "```\n" + selected + "\n```";
      return {
        changes: [{ from: sel.from, to: sel.to, insert }],
        anchor: sel.from + 4,
        head: sel.from + 4 + selected.length,
      };
    }
    return wrap(text, sel, "`", "`");
  }
  return wrap(text, sel, "`", "`");
}

/// Computes the edits and new selection that turn the given selection into the
/// requested Markdown formatting. Positions are relative to the document after
/// the edits are applied.
export function formatText(
  text: string,
  sel: FormatSelection,
  operation: FormatOperation,
): FormatChange {
  switch (operation) {
    case "bold":
      return bold(text, sel);
    case "italic":
      return italic(text, sel);
    case "heading":
      return heading(text, sel);
    case "list":
      return list(text, sel);
    case "link":
      return link(text, sel);
    case "code":
      return code(text, sel);
  }
}
