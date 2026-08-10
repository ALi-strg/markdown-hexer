import type { EditorState } from "@codemirror/state";
import type { Tab } from "../stores/document";

/// One Tab's preserved editor session: the CodeMirror state — the cursor,
/// selection, and undo history travel with it — plus the editor's scroll
/// offset, captured when the user switched away from the Tab.
export interface PreservedTabEditorState {
  state: EditorState;
  scrollTop: number;
}

/// The preserved editor state per Tab, keyed by the Tab record itself. The
/// state is deliberately kept outside the reactive Tab records: a Vue reactive
/// proxy around a CodeMirror state breaks the strict state-identity checks on
/// dispatch, and pinia's deep ref unwrapping mangles the class type. A WeakMap
/// also lets the entry die with the Tab once it is closed.
const preserved = new WeakMap<Tab, PreservedTabEditorState>();

/// Records the editor state and scroll offset of `tab` for a later switch
/// back. Called when the user switches away from the Tab.
export function preserveTabEditorState(
  tab: Tab,
  state: EditorState,
  scrollTop: number,
): void {
  preserved.set(tab, { state, scrollTop });
}

/// The preserved editor state of `tab`, or null when the Tab has none — it is
/// Active (the mounted editor holds the live state), was never switched away
/// from, or its content was rebuilt by New / Open / an external reload.
export function getPreservedTabEditorState(
  tab: Tab,
): PreservedTabEditorState | null {
  return preserved.get(tab) ?? null;
}

/// Drops the preserved editor state of `tab`. Called when the on-disk version
/// replaced the Document (external reload), which makes the preserved cursor
/// and undo history stale.
export function clearPreservedTabEditorState(tab: Tab): void {
  preserved.delete(tab);
}
