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
import { getCurrentWindow } from "@tauri-apps/api/window";
import EditorPane from "./components/EditorPane.vue";
import PreviewPane from "./components/PreviewPane.vue";
import { confirmDiscard } from "./lib/confirmDiscard";
import { pickOpenPath } from "./lib/openDialog";
import { useSyncedScrolling, type SyncedScrollingView } from "./lib/useSyncedScrolling";
import { useDocumentStore } from "./stores/document";
import { useSettingsStore } from "./stores/settings";
import { useUiStore } from "./stores/ui";

const document = useDocumentStore();
const settings = useSettingsStore();
const ui = useUiStore();

const editorPane = ref<{
  getView: () => SyncedScrollingView | null;
  replaceContent: (text: string) => void;
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
  if (modifier && (event.key === "n" || event.key === "N")) {
    event.preventDefault();
    await runNewDocument();
    return;
  }
  if (modifier && (event.key === "o" || event.key === "O")) {
    event.preventDefault();
    await runOpenDocument();
    return;
  }
  if (modifier && event.shiftKey && (event.key === "P" || event.key === "p")) {
    event.preventDefault();
    ui.cycleLayoutMode();
  }
}

async function runNewDocument() {
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  document.newDocument();
  editorPane.value?.replaceContent(document.content);
  ui.applyDocumentLoadMode(true);
}

/// Swaps the current Document for the file at `path` and applies the
/// auto-chosen Layout Mode (Preview Only for an opened file). Shared by the
/// native Open dialog and drag-and-drop so both use one code path.
async function openPath(path: string) {
  const opened = await document.openDocument(path);
  if (opened) {
    editorPane.value?.replaceContent(document.content);
    ui.applyDocumentLoadMode(false);
  }
}

async function runOpenDocument() {
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  const path = await pickOpenPath({
    defaultPath: document.canonicalPath ?? ui.lastDirectory ?? undefined,
  });
  if (path === null) {
    return;
  }
  await openPath(path);
}

/// Opens a file dropped onto the window through the same Open flow as the
/// native dialog: the Confirm-Discard Guard runs first when the current
/// Document is Dirty, then the Document is swapped.
async function runDropOpen(path: string) {
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  await openPath(path);
}

const appWindow = getCurrentWindow();
let unlistenCloseRequested: (() => void) | null = null;
let unlistenFocusChanged: (() => void) | null = null;
let unlistenDragDrop: (() => void) | null = null;

async function onCloseRequested(event: { preventDefault: () => void }) {
  if (!document.dirty) {
    return;
  }
  event.preventDefault();
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  // E2E seam: keep the window alive so the close-guard suite survives the
  // single app instance a wdio run launches.
  if (import.meta.env.VITE_E2E === "1") {
    return;
  }
  await appWindow.destroy();
}

/// Detects an Externally-Modified file when the window regains focus.
///
/// A silent reload or a chosen Reload replaces the Document, so the editor (the
/// authoritative source of edits) is pushed the new content explicitly.
async function onWindowFocused() {
  const replaced = await document.checkExternalModification();
  if (replaced) {
    editorPane.value?.replaceContent(document.content);
  }
}

onMounted(async () => {
  syncWindowTitle();
  window.addEventListener("keydown", onKeydown);
  syncedScrolling.attach();
  unlistenCloseRequested = await appWindow.onCloseRequested(onCloseRequested);
  unlistenFocusChanged = await appWindow.onFocusChanged(({ payload: focused }) => {
    if (focused) {
      onWindowFocused();
    }
  });
  unlistenDragDrop = await appWindow.onDragDropEvent((event) => {
    if (event.payload.type === "drop" && event.payload.paths.length > 0) {
      runDropOpen(event.payload.paths[0]);
    }
  });
  if (import.meta.env.VITE_E2E === "1") {
    (globalThis as Record<string, unknown>).__triggerWindowClose = () =>
      appWindow.close();
    (globalThis as Record<string, unknown>).__triggerExternalCheck = () =>
      onWindowFocused();
    (globalThis as Record<string, unknown>).__triggerDrop = (path: string) =>
      runDropOpen(path);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  syncedScrolling.detach();
  unlistenCloseRequested?.();
  unlistenFocusChanged?.();
  unlistenDragDrop?.();
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
