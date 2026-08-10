<template>
  <section ref="paneRef" class="editor-pane" data-testid="editor-pane">
    <div ref="editorHost" class="editor-host"></div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { panels } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { undoDepth, redoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search } from "@codemirror/search";
import { useDocumentStore } from "../stores/document";
import { useUiStore } from "../stores/ui";
import {
  getPreservedTabEditorState,
  preserveTabEditorState,
} from "../lib/tabEditorState";

const document = useDocumentStore();
const ui = useUiStore();
const editorHost = ref<HTMLElement | null>(null);
/// The pane's root section; its `v-show` display state tells whether the
/// editor is visible (see `paneVisible`).
const paneRef = ref<HTMLElement | null>(null);

/// The CodeMirror instance. `shallowRef` (not `ref`) keeps it raw: a reactive
/// `ref` wraps it in a proxy, so `view.state` would be a reactive proxy of the
/// EditorState and transactions built from it would fail the view's strict
/// `startState` identity check on dispatch.
const view = shallowRef<EditorView | null>(null);

/// Whether the editor's native history currently has anything to undo or redo.
/// Surfaced reactively to the toolbar so the Undo/Redo buttons disable when the
/// history is empty, mirroring CodeMirror's own command availability.
const canUndo = ref(false);
const canRedo = ref(false);

function syncHistoryState(state: EditorState) {
  canUndo.value = undoDepth(state) > 0;
  canRedo.value = redoDepth(state) > 0;
}

/// The find/replace panel is hosted by the app, not the Editor Pane, so it
/// stays visible in Preview Only where this pane is hidden. CodeMirror's own
/// panel is therefore routed into an off-screen host purely to activate the
/// native match highlighting (it is never shown to the user).
let hiddenPanelHost: HTMLElement | null = null;

function editorExtensions(): Extension[] {
  return [
    basicSetup,
    markdown(),
    search({ top: true }),
    panels({
      topContainer: hiddenPanelHost!,
      bottomContainer: hiddenPanelHost!,
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        document.mirrorContent(update.state.doc.toString());
      }
      syncHistoryState(update.state);
    }),
  ];
}

function createEditorState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: editorExtensions() });
}

onMounted(() => {
  hiddenPanelHost = globalThis.document.createElement("div");
  hiddenPanelHost.style.display = "none";
  globalThis.document.body.appendChild(hiddenPanelHost);
  const state = createEditorState(document.content);
  syncHistoryState(state);
  view.value = new EditorView({
    state,
    parent: editorHost.value!,
  });
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
  hiddenPanelHost?.remove();
  hiddenPanelHost = null;
});

/// Replaces the editor's content after a Document swap (New / Open).
///
/// The editor is authoritative for edits and the store never writes back into
/// it, so the app calls this explicitly when a new Document is loaded. Rebuilding
/// the state clears the undo history of the previous Document.
function replaceContent(text: string) {
  if (view.value === null) {
    return;
  }
  const state = createEditorState(text);
  syncHistoryState(state);
  view.value.setState(state);
}

/// The Active Tab's scroll offset whose application was deferred because the
/// pane was hidden when the Tab was restored (its Layout Mode is Preview
/// Only): the scroller has no layout while hidden, so writing the offset
/// no-ops. Applied the moment the pane becomes visible, so the offset is
/// neither lost nor overwritten by the pane's stale 0. `null` when nothing is
/// deferred.
let pendingScrollTop: number | null = null;

/// Applies a deferred scroll offset once the pane becomes visible. The pane's
/// visibility is driven by the Layout Mode (`v-show` in App.vue hides it in
/// Preview Only); `flush: "post"` runs after the mode's DOM update, so the
/// pane actually has layout when the offset is written.
watch(
  () => ui.layoutMode,
  () => {
    nextTick(() => {
      const v = view.value;
      if (v !== null && pendingScrollTop !== null && paneVisible()) {
        v.scrollDOM.scrollTop = pendingScrollTop;
        pendingScrollTop = null;
      }
    });
  },
  { flush: "post" },
);

/// Whether the editor pane is currently visible. The pane is `v-show`-hidden
/// in Preview Only (`v-show` toggles the inline display style, so the check
/// reads `el.style.display` — the same value a browser layout would compute);
/// a hidden pane has no layout, so its scroll offset reads 0 and writing one
/// into it no-ops.
function paneVisible(): boolean {
  const pane = paneRef.value;
  return pane !== null && pane.style.display !== "none";
}

/// Captures the Active Tab's live editor state — Document, selection, and undo
/// history travel with the EditorState — plus its scroll offset, keyed by the
/// Tab record, so a later switch back can restore them. The state lives in a
/// WeakMap outside the reactive store: a Vue reactive proxy around a CodeMirror
/// state breaks the strict state-identity checks on dispatch (the same hazard
/// the view's `shallowRef` documents). The scroll offset is captured only
/// while the pane is visible; a hidden pane reads 0 and must not clobber a
/// preserved offset.
function captureActiveTabState() {
  const v = view.value;
  if (v === null) {
    return;
  }
  const tab = document.activeTab();
  const scrollTop = paneVisible()
    ? v.scrollDOM.scrollTop
    : (getPreservedTabEditorState(tab)?.scrollTop ?? 0);
  preserveTabEditorState(tab, v.state, scrollTop);
}

/// Loads the Active Tab's preserved editor state into the mounted editor —
/// cursor and undo history travel with the state — and restores its scroll
/// offset. A Tab without a preserved state (freshly created, or rebuilt by
/// New / Open / external reload) rebuilds from the store, clearing undo
/// history exactly as the destructive path always did.
function restoreActiveTabState() {
  const v = view.value;
  if (v === null) {
    return;
  }
  const preserved = getPreservedTabEditorState(document.activeTab());
  const scrollTop = preserved?.scrollTop ?? 0;
  if (preserved !== null) {
    v.setState(preserved.state);
    syncHistoryState(preserved.state);
  } else {
    replaceContent(document.content);
  }
  // `setState` does not fire the update listener and does not touch the
  // scroller; apply the saved offset after the pane's `v-show` settles. A
  // hidden pane (incoming Tab in Preview Only) has no layout, so the offset is
  // deferred until the pane becomes visible instead of being dropped.
  nextTick(() => {
    if (paneVisible()) {
      v.scrollDOM.scrollTop = scrollTop;
    } else {
      pendingScrollTop = scrollTop;
    }
  });
}

defineExpose({
  getView: () => view.value,
  replaceContent,
  captureActiveTabState,
  restoreActiveTabState,
  canUndo,
  canRedo,
});

</script>

<style scoped>
.editor-pane {
  display: flex;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.editor-host {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.editor-host :deep(.cm-editor) {
  height: 100%;
}

.editor-host :deep(.cm-scroller) {
  font-family: var(--editor-font-family);
  font-size: var(--editor-font-size);
  line-height: 1.6;
}
</style>
