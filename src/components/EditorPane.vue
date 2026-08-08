<template>
  <section class="editor-pane" data-testid="editor-pane">
    <div ref="editorHost" class="editor-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { panels } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { undoDepth, redoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search } from "@codemirror/search";
import { useDocumentStore } from "../stores/document";

const document = useDocumentStore();
const editorHost = ref<HTMLElement | null>(null);

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

defineExpose({
  getView: () => view.value,
  replaceContent,
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
