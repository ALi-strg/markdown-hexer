import type { EditorView } from "@codemirror/view";
import { formatText, type FormatOperation } from "./formatting";

/// Applies a formatting operation to the editor's current selection.
///
/// Dispatches a real transaction through CodeMirror so the change participates
/// in the normal undo/redo history. The formatter computes the selection in
/// post-change positions, so the dispatch uses them directly.
export function applyFormatting(view: EditorView, operation: FormatOperation) {
  const { from, to } = view.state.selection.main;
  const result = formatText(view.state.doc.toString(), { from, to }, operation);
  view.dispatch({
    changes: result.changes,
    selection: { anchor: result.anchor, head: result.head },
    // A distinct user event keeps the formatting its own undo group, so
    // Cmd/Ctrl+Z reverts the formatting without also reverting prior typing.
    userEvent: "format",
  });
}
