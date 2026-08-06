import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Transaction } from "@codemirror/state";
import { undo } from "@codemirror/commands";
import { applyFormatting } from "../editorFormatting";

describe("applyFormatting", () => {
  let host: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    view = new EditorView({
      state: EditorState.create({ doc: "", extensions: [basicSetup] }),
      parent: host,
    });
  });

  afterEach(() => {
    view.destroy();
    host.remove();
  });

  function typeAndSelect(text: string, from: number, to: number) {
    view.dispatch({ changes: { from: 0, insert: text } });
    view.dispatch({
      selection: { anchor: from, head: to },
      annotations: Transaction.addToHistory.of(false),
    });
  }

  it("wraps the current selection", () => {
    typeAndSelect("hello world", 0, 5);

    applyFormatting(view, "bold");

    expect(view.state.doc.toString()).toBe("**hello** world");
  });

  it("reverts with the normal undo command", () => {
    typeAndSelect("hello", 0, 5);

    applyFormatting(view, "italic");
    expect(view.state.doc.toString()).toBe("*hello*");

    undo(view);

    expect(view.state.doc.toString()).toBe("hello");
  });

  it("marks formatting as its own undo group, separate from typing", () => {
    typeAndSelect("hello", 0, 5);

    applyFormatting(view, "bold");
    undo(view);
    expect(view.state.doc.toString()).toBe("hello");

    undo(view);
    expect(view.state.doc.toString()).toBe("");
  });
});
