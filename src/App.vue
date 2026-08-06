<template>
  <div class="app" :data-theme="settings.theme" data-testid="app">
    <div class="workspace" :class="`layout-${ui.layoutMode}`">
      <EditorPane
        v-show="ui.layoutMode !== 'preview'"
        class="pane editor-pane"
        data-testid="editor-pane"
      />
      <PreviewPane
        v-show="ui.layoutMode !== 'focus'"
        class="pane preview-pane"
        data-testid="preview-pane"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import EditorPane from "./components/EditorPane.vue";
import PreviewPane from "./components/PreviewPane.vue";
import { useDocumentStore } from "./stores/document";
import { useSettingsStore } from "./stores/settings";
import { useUiStore } from "./stores/ui";

const document = useDocumentStore();
const settings = useSettingsStore();
const ui = useUiStore();

async function syncWindowTitle() {
  globalThis.document.title = document.title;
  await invoke("set_document_title", {
    filename: document.filename,
    dirty: document.dirty,
  });
}

function onKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.shiftKey && (event.key === "P" || event.key === "p")) {
    event.preventDefault();
    ui.cycleLayoutMode();
  }
}

onMounted(() => {
  syncWindowTitle();
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
watch(() => [document.filename, document.dirty], syncWindowTitle);
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.pane {
  min-width: 0;
  min-height: 0;
}

.layout-split .editor-pane,
.layout-split .preview-pane {
  flex: 1 1 50%;
}

.layout-preview .preview-pane {
  flex: 1 1 100%;
}

.layout-focus .editor-pane {
  flex: 1 1 100%;
}
</style>
