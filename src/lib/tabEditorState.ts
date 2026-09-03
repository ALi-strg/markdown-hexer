import { nextTick } from "vue";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
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

export function preserveTabEditorState(
  tab: Tab,
  state: EditorState,
  scrollTop: number,
): void {
  preserved.set(tab, { state, scrollTop });
}

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

/// Everything the session controller needs from its host. The component owns
/// the view, the pane's visibility, and state creation (the extensions live
/// there); the store reads stay behind getters so this module unit-tests
/// against fakes. The hooks let the app join the protocol without the
/// controller knowing about the ui store or the external-modification check.
export interface TabSessionDeps {
  getView: () => EditorView | null;
  getActiveTab: () => Tab;
  isPaneVisible: () => boolean;
  getContent: () => string;
  createState: (doc: string) => EditorState;
  /// Syncs the toolbar's Undo/Redo availability after `setState`, which fires
  /// no update listener.
  onHistorySync?: (state: EditorState) => void;
  /// Runs after a successful swap, before the incoming Tab's state lands —
  /// the app closes the Find & Replace overlay here.
  onSwitched?: () => void;
  /// Runs after a restore — an incoming Tab that kept its preserved state is
  /// checked for external changes; a rebuilt one is fresh from disk or store.
  onRestored?: () => void;
}

export interface TabSwitchOptions<T> {
  /// Captures the outgoing Active Tab's editor state first (the default).
  /// `false` when the outgoing Tab is being closed and its state dies with it.
  capture?: boolean;
  /// The store-level swap. Returning null means nothing switched — the
  /// restore/rebuild tail is skipped. May be async (Open's dialog round-trip).
  swap: () => T | null | Promise<T | null>;
  /// Chooses the incoming Tab's editor treatment from the swap's result.
  /// Returning null skips the tail entirely.
  after: (result: T) => "restore" | "rebuild" | null;
}

/// The Tab-switch protocol, in one place: capture the outgoing Tab's editor
/// state, run the store-level swap, close the Find & Replace overlay, then
/// restore the incoming Tab's preserved state or rebuild it destructively.
/// Every path that moves the Active Tab goes through here — the ordering is
/// enforced by this function, not by five call sites keeping step.
export type TabSession = ReturnType<typeof createTabSession>;

export function createTabSession(deps: TabSessionDeps) {
  /// The Active Tab's scroll offset whose application was deferred because the
  /// pane was hidden when the Tab was restored (its Layout Mode is Preview
  /// Only): the scroller has no layout while hidden, so writing the offset
  /// no-ops. Applied the moment the pane becomes visible, so the offset is
  /// neither lost nor overwritten by the pane's stale 0. `null` when nothing
  /// is deferred.
  let pendingScrollTop: number | null = null;

  function captureActiveTabState() {
    const view = deps.getView();
    if (view === null) {
      return;
    }
    const tab = deps.getActiveTab();
    const scrollTop = deps.isPaneVisible()
      ? view.scrollDOM.scrollTop
      : (getPreservedTabEditorState(tab)?.scrollTop ?? 0);
    preserveTabEditorState(tab, view.state, scrollTop);
  }

  /// `setState` does not fire the update listener and does not touch the
  /// scroller; apply the offset after the pane's `v-show` settles. A hidden
  /// pane has no layout, so the offset is deferred until the pane becomes
  /// visible instead of being dropped. A visible apply supersedes any deferred
  /// value: the pending slot holds the offset of whichever Tab was last
  /// restored hidden, and the mode-change flush would otherwise replay it over
  /// this Tab's freshly applied offset.
  function deferScroll(view: EditorView, scrollTop: number) {
    void nextTick().then(() => {
      if (deps.isPaneVisible()) {
        view.scrollDOM.scrollTop = scrollTop;
        pendingScrollTop = null;
      } else {
        pendingScrollTop = scrollTop;
      }
    });
  }

  /// Applies a deferred scroll offset once the pane becomes visible. The
  /// pane's visibility is driven by the Layout Mode; the host calls this after
  /// the mode's DOM update, so the pane actually has layout when the offset is
  /// written.
  function flushPendingScroll() {
    const view = deps.getView();
    if (
      view !== null &&
      pendingScrollTop !== null &&
      deps.isPaneVisible()
    ) {
      view.scrollDOM.scrollTop = pendingScrollTop;
      pendingScrollTop = null;
    }
  }

  /// Loads the Active Tab's preserved editor state into the mounted editor —
  /// cursor and undo history travel with the state — and restores its scroll
  /// offset. A Tab without a preserved state (freshly created, or rebuilt by
  /// New / Open / external reload) rebuilds from the store, clearing undo
  /// history exactly as the destructive path always did.
  function restoreActiveTabState() {
    const view = deps.getView();
    if (view === null) {
      return;
    }
    const preservedState = getPreservedTabEditorState(deps.getActiveTab());
    const scrollTop = preservedState?.scrollTop ?? 0;
    if (preservedState !== null) {
      view.setState(preservedState.state);
      deps.onHistorySync?.(preservedState.state);
    } else {
      const state = deps.createState(deps.getContent());
      deps.onHistorySync?.(state);
      view.setState(state);
    }
    deferScroll(view, scrollTop);
  }

  /// Replaces the editor's content destructively (New / Open / external
  /// reload): a fresh state from the store clears the undo history of the
  /// previous Document and starts the incoming one at the top.
  function rebuildActiveTabState() {
    const view = deps.getView();
    if (view === null) {
      return;
    }
    const state = deps.createState(deps.getContent());
    deps.onHistorySync?.(state);
    view.setState(state);
    deferScroll(view, 0);
  }

  function runTabSwitch<T>(options: TabSwitchOptions<T>): void | Promise<void> {
    if (options.capture !== false) {
      captureActiveTabState();
    }
    const finish = (result: T | null) => {
      if (result === null) {
        return;
      }
      deps.onSwitched?.();
      const mode = options.after(result);
      if (mode === "restore") {
        restoreActiveTabState();
        deps.onRestored?.();
      } else if (mode === "rebuild") {
        rebuildActiveTabState();
      }
    };
    const result = options.swap();
    if (result instanceof Promise) {
      return result.then(finish).then(() => undefined);
    }
    finish(result);
  }

  return { runTabSwitch, flushPendingScroll, rebuild: rebuildActiveTabState };
}
