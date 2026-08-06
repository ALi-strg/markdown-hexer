<template>
  <section class="editor-pane" data-testid="editor-pane">
    <div ref="editorHost" class="editor-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { panels } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { search } from "@codemirror/search";
import { useDocumentStore } from "../stores/document";

const document = useDocumentStore();
const editorHost = ref<HTMLElement | null>(null);
const view = ref<EditorView | null>(null);

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
  view.value = new EditorView({
    state: createEditorState(document.content),
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
  view.value.setState(createEditorState(text));
}

defineExpose({ getView: () => view.value, replaceContent });

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
