<template>
  <section class="editor-pane" data-testid="editor-pane">
    <div ref="editorHost" class="editor-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { useDocumentStore } from "../stores/document";

const document = useDocumentStore();
const editorHost = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

onMounted(() => {
  view = new EditorView({
    state: EditorState.create({
      doc: document.content,
      extensions: [basicSetup, markdown()],
    }),
    parent: editorHost.value!,
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
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
