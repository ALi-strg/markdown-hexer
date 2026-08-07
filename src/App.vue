<template>
  <div
    class="app"
    :data-theme="settings.theme"
    :data-font="settings.font"
    data-testid="app"
  >
    <Toolbar
      :layout-mode="ui.layoutMode"
      :theme="settings.theme"
      :font="settings.font"
      @format="onFormat"
      @theme-change="onThemeChange"
      @font-change="onFontChange"
      @layout-change="onLayoutChange"
    />
    <FindReplacePanel
      v-if="ui.findOverlayOpen"
      ref="findPanelRef"
      :get-view="getEditorView"
    />
    <div
      ref="workspaceRef"
      class="workspace"
      :class="`layout-${ui.layoutMode}`"
    >
      <EditorPane
        ref="editorPane"
        v-show="ui.layoutMode !== 'preview'"
        class="pane editor-pane"
        data-testid="editor-pane"
        :style="editorBasisStyle"
      />
      <div
        v-if="ui.layoutMode === 'split'"
        ref="dividerRef"
        class="divider"
        data-testid="divider"
        role="separator"
        aria-orientation="vertical"
        @pointerdown="onDividerPointerDown"
      ></div>
      <PreviewPane
        ref="previewPane"
        v-show="ui.layoutMode !== 'focus'"
        class="pane preview-pane"
        data-testid="preview-pane"
        :on-render="() => syncedScrolling.sync()"
        :style="previewBasisStyle"
      />
    </div>
    <div v-if="ui.toast" class="toast" data-testid="toast" role="status">
      {{ ui.toast }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  nextTick,
  ref,
  watch,
} from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openSearchPanel } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import EditorPane from "./components/EditorPane.vue";
import FindReplacePanel from "./components/FindReplacePanel.vue";
import PreviewPane from "./components/PreviewPane.vue";
import Toolbar from "./components/Toolbar.vue";
import { confirmDiscard } from "./lib/confirmDiscard";
import { applyFormatting } from "./lib/editorFormatting";
import type { FormatOperation } from "./lib/formatting";
import { pickOpenPath } from "./lib/openDialog";
import { useSyncedScrolling } from "./lib/useSyncedScrolling";
import { useDocumentStore } from "./stores/document";
import {
  useSettingsStore,
  type Font,
  type Theme,
} from "./stores/settings";
import { useUiStore, type LayoutMode } from "./stores/ui";

const document = useDocumentStore();
const settings = useSettingsStore();
const ui = useUiStore();

const editorPane = ref<{
  getView: () => EditorView | null;
  replaceContent: (text: string) => void;
} | null>(null);
const previewPane = ref<{
  getPreviewHost: () => HTMLElement | null;
} | null>(null);
const findPanelRef = ref<{ focusQuery: () => void } | null>(null);
const workspaceRef = ref<HTMLElement | null>(null);
const dividerRef = ref<HTMLElement | null>(null);

/// Balances the panes in Split View: the Editor Pane takes `dividerPosition`
/// of the workspace width and the Preview Pane the remainder. Outside Split
/// View the panes fill the workspace, so no basis is applied.
const editorBasisStyle = computed(() =>
  ui.layoutMode === "split"
    ? { flexBasis: `${roundPercent(ui.dividerPosition)}%` }
    : null,
);
const previewBasisStyle = computed(() =>
  ui.layoutMode === "split"
    ? { flexBasis: `${roundPercent(1 - ui.dividerPosition)}%` }
    : null,
);

/// Formats a 0..1 fraction as a percentage string, avoiding float noise like
/// `30.000000000000004%` in the rendered inline style.
function roundPercent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

const MIN_DIVIDER_POSITION = 0.15;
const MAX_DIVIDER_POSITION = 0.85;

function clampDividerPosition(position: number): number {
  return Math.min(
    MAX_DIVIDER_POSITION,
    Math.max(MIN_DIVIDER_POSITION, position),
  );
}

/// Starts a divider drag: tracks the pointer against the workspace width and
/// writes the new balance into the ui store (which survives mode switches but
/// not launches). Pointer capture keeps the drag going when the pointer leaves
/// the divider; the listeners are torn down on release.
function onDividerPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }
  const divider = dividerRef.value;
  const workspace = workspaceRef.value;
  if (divider === null || workspace === null) {
    return;
  }
  event.preventDefault();
  if (typeof divider.setPointerCapture === "function") {
    try {
      divider.setPointerCapture(event.pointerId);
    } catch {
      // Pointer not active (e.g. synthetic events in tests).
    }
  }
  const startX = event.clientX;
  const startPosition = ui.dividerPosition;
  const width = workspace.getBoundingClientRect().width;

  const onPointerMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    ui.dividerPosition =
      width > 0
        ? clampDividerPosition(startPosition + delta / width)
        : startPosition;
  };
  const onPointerUp = () => {
    divider.removeEventListener("pointermove", onPointerMove);
    divider.removeEventListener("pointerup", onPointerUp);
  };
  divider.addEventListener("pointermove", onPointerMove);
  divider.addEventListener("pointerup", onPointerUp);
}

const syncedScrolling = useSyncedScrolling({
  getView: () => editorPane.value?.getView() ?? null,
  getPreviewHost: () => previewPane.value?.getPreviewHost() ?? null,
  getLayoutMode: () => ui.layoutMode,
  getSource: () => document.content,
});

function getEditorView(): EditorView | null {
  return editorPane.value?.getView() ?? null;
}

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
  if (modifier && (event.key === "b" || event.key === "B")) {
    event.preventDefault();
    onFormat("bold");
    return;
  }
  if (modifier && (event.key === "i" || event.key === "I")) {
    event.preventDefault();
    onFormat("italic");
    return;
  }
  if (modifier && (event.key === "f" || event.key === "F")) {
    event.preventDefault();
    onFind();
    return;
  }
  if (modifier && event.shiftKey && (event.key === "P" || event.key === "p")) {
    event.preventDefault();
    ui.cycleLayoutMode();
  }
}

/// Opens the find & replace overlay in any Layout Mode. The first open also
/// activates CodeMirror's search state (seeding the query from the current
/// selection and enabling match highlighting); a later Cmd/Ctrl+F just returns
/// focus to the query field. The Editor Pane stays hidden in Preview Only until
/// a replace is attempted, which is the FindReplacePanel's job.
function onFind() {
  const view = editorPane.value?.getView();
  if (!view) {
    return;
  }
  if (!ui.findOverlayOpen) {
    ui.findOverlayOpen = true;
    openSearchPanel(view);
  }
  nextTick(() => findPanelRef.value?.focusQuery());
}

/// Applies a toolbar formatting operation to the Editor Pane. In Preview Only
/// there is no visible Editor Pane to format, so the toolbar hides its buttons
/// and the shortcuts no-op.
function onFormat(operation: FormatOperation) {
  if (ui.layoutMode === "preview") {
    return;
  }
  const view = editorPane.value?.getView();
  if (view) {
    applyFormatting(view, operation);
  }
}

/// Applies a Theme chosen from the toolbar. The store persists it, so the next
/// launch restores it; System keeps following the OS via CSS.
function onThemeChange(theme: Theme) {
  settings.setTheme(theme);
}

/// Applies a font stack chosen from the toolbar. The store persists it, so the
/// next launch restores it; the app root's data-font drives the CSS variables
/// that both panes consume.
function onFontChange(font: Font) {
  settings.setFont(font);
}

/// Sets a Layout Mode from the Layout Switcher. Direct selection overrides any
/// auto-choice until the next Document load, same as the cycle shortcut.
function onLayoutChange(mode: LayoutMode) {
  ui.setLayoutMode(mode);
}

async function runNewDocument() {
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  document.newDocument();
  ui.findOverlayOpen = false;
  editorPane.value?.replaceContent(document.content);
  ui.applyDocumentLoadMode(true);
}

/// Swaps the current Document for the file at `path` and applies the
/// auto-chosen Layout Mode (Preview Only for an opened file). Shared by the
/// native Open dialog and drag-and-drop so both use one code path.
async function openPath(path: string) {
  const opened = await document.openDocument(path);
  if (opened) {
    ui.findOverlayOpen = false;
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
async function runGuardedOpen(path: string) {
  const decision = await confirmDiscard(document);
  if (decision === "cancel") {
    return;
  }
  await openPath(path);
}

/// Opens a file the OS asked us to open (launched with a file argument, or a
/// path forwarded by a second instance). Shares the guarded Open flow.
async function runLaunchFileOpen(path: string) {
  await runGuardedOpen(path);
}

const appWindow = getCurrentWindow();
let unlistenCloseRequested: (() => void) | null = null;
let unlistenFocusChanged: (() => void) | null = null;
let unlistenDragDrop: (() => void) | null = null;
let unlistenFileOpen: (() => void) | null = null;

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
    ui.findOverlayOpen = false;
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
      runGuardedOpen(event.payload.paths[0]);
    }
  });
  unlistenFileOpen = await listen<string>("file-open-requested", (event) => {
    runLaunchFileOpen(event.payload);
  });
  // Register the listener before pulling the pending path so a forward that
  // arrives mid-startup is not lost: either the listener or the pull opens it.
  const pendingFile = await invoke<string | null>("get_pending_file");
  if (typeof pendingFile === "string") {
    await runLaunchFileOpen(pendingFile);
  }
  if (import.meta.env.VITE_E2E === "1") {
    (globalThis as Record<string, unknown>).__triggerWindowClose = () =>
      appWindow.close();
    (globalThis as Record<string, unknown>).__triggerExternalCheck = () =>
      onWindowFocused();
    (globalThis as Record<string, unknown>).__triggerDrop = (path: string) =>
      runGuardedOpen(path);
    (globalThis as Record<string, unknown>).__triggerFileOpen = (
      path: string,
    ) => runLaunchFileOpen(path);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  syncedScrolling.detach();
  unlistenCloseRequested?.();
  unlistenFocusChanged?.();
  unlistenDragDrop?.();
  unlistenFileOpen?.();
});
watch(() => [document.filename, document.dirty], syncWindowTitle);
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--background-color);
  color: var(--text-color);
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
  flex: 1 1 auto;
}

.divider {
  flex: 0 0 6px;
  cursor: col-resize;
  background: var(--border-color, #e0e0e0);
  touch-action: none;
}

.divider:hover {
  background: var(--accent-color, #888);
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
