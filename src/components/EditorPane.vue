<template>
  <section class="editor-pane" data-testid="editor-pane">
    <div ref="editorHost" class="editor-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { useDocumentStore } from "../stores/document";

const document = useDocumentStore();
const editorHost = ref<HTMLElement | null>(null);
const view = ref<EditorView | null>(null);

const editorExtensions: Extension[] = [
  basicSetup,
  markdown(),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      document.mirrorContent(update.state.doc.toString());
    }
  }),
];

function createEditorState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: editorExtensions });
}

onMounted(() => {
  view.value = new EditorView({
    state: createEditorState(document.content),
    parent: editorHost.value!,
  });
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
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
