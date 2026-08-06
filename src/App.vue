<template>
  <div class="app" :data-theme="settings.theme" data-testid="app">
    <div class="workspace" :class="`layout-${ui.layoutMode}`">
      <EditorPane
        ref="editorPane"
        v-show="ui.layoutMode !== 'preview'"
        class="pane editor-pane"
        data-testid="editor-pane"
      />
      <PreviewPane
        ref="previewPane"
        v-show="ui.layoutMode !== 'focus'"
        class="pane preview-pane"
        data-testid="preview-pane"
        :on-render="() => syncedScrolling.sync()"
      />
    </div>
    <div v-if="ui.toast" class="toast" data-testid="toast" role="status">
      {{ ui.toast }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import EditorPane from "./components/EditorPane.vue";
import PreviewPane from "./components/PreviewPane.vue";
import { useSyncedScrolling, type SyncedScrollingView } from "./lib/useSyncedScrolling";
import { useDocumentStore } from "./stores/document";
import { useSettingsStore } from "./stores/settings";
import { useUiStore } from "./stores/ui";

const document = useDocumentStore();
const settings = useSettingsStore();
const ui = useUiStore();

const editorPane = ref<{
  getView: () => SyncedScrollingView | null;
} | null>(null);
const previewPane = ref<{
  getPreviewHost: () => HTMLElement | null;
} | null>(null);

const syncedScrolling = useSyncedScrolling({
  getView: () => editorPane.value?.getView() ?? null,
  getPreviewHost: () => previewPane.value?.getPreviewHost() ?? null,
  getLayoutMode: () => ui.layoutMode,
  getSource: () => document.content,
});

async function syncWindowTitle() {
  globalThis.document.title = document.title;
  await invoke("set_document_title", {
    filename: document.filename,
    dirty: document.dirty,
  });
}

async function onKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && (event.key === "s" || event.key === "S")) {
    event.preventDefault();
    if (event.shiftKey) {
      await document.saveAs();
    } else {
      await document.save();
    }
    return;
  }
  if (modifier && event.shiftKey && (event.key === "P" || event.key === "p")) {
    event.preventDefault();
    ui.cycleLayoutMode();
  }
}

onMounted(() => {
  syncWindowTitle();
  window.addEventListener("keydown", onKeydown);
  syncedScrolling.attach();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  syncedScrolling.detach();
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

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 6px;
  background: var(--toast-background, #333);
  color: var(--toast-color, #fff);
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}
</style>
