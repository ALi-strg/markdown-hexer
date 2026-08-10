<template>
  <div
    class="app"
    :data-theme="settings.resolvedTheme"
    :data-font="settings.font"
    :data-text-size="settings.textSize"
    data-testid="app"
  >
    <TabBar
      :tabs="document.tabs"
      :active-index="document.activeIndex"
      @activate="onTabActivate"
      @close="onTabClose"
      @new="runNewDocument"
    />
    <Toolbar
      :layout-mode="ui.layoutMode"
      :theme="settings.theme"
      :font="settings.font"
      :text-size="settings.textSize"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @format="onFormat"
      @new="runNewDocument"
      @open="runOpenDocument"
      @save="onSave"
      @save-as="onSaveAs"
      @find="onFind"
      @undo="onUndo"
      @redo="onRedo"
      @theme-change="onThemeChange"
      @font-change="onFontChange"
      @text-size-change="onTextSizeChange"
      @layout-change="onLayoutChange"
      @help="onHelp"
    />
    <FindReplacePanel
      v-if="ui.findOverlayOpen"
      ref="findPanelRef"
      :get-view="getEditorView"
    />
    <ShortcutsReference
      v-if="shortcutsOpen"
      @close="closeShortcuts"
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
import { redo as redoCommand, undo as undoCommand } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import EditorPane from "./components/EditorPane.vue";
import FindReplacePanel from "./components/FindReplacePanel.vue";
import PreviewPane from "./components/PreviewPane.vue";
import ShortcutsReference from "./components/ShortcutsReference.vue";
import TabBar from "./components/TabBar.vue";
import Toolbar from "./components/Toolbar.vue";
import { confirmDiscard } from "./lib/confirmDiscard";
import { applyFormatting } from "./lib/editorFormatting";
import type { FormatOperation } from "./lib/formatting";
import { pickOpenPath } from "./lib/openDialog";
import {
  CYCLE_LAYOUT_COMBO,
  DOCUMENT_SHORTCUTS,
  FORMAT_SHORTCUTS,
  HELP_SHORTCUT,
  matchesCombo,
  type DocumentControlOperation,
} from "./lib/shortcuts";
import { useSyncedScrolling } from "./lib/useSyncedScrolling";
import { isTabDirty, useDocumentStore } from "./stores/document";
import {
  useSettingsStore,
  type Font,
  type TextSize,
  type Theme,
} from "./stores/settings";
import { useUiStore, type LayoutMode } from "./stores/ui";

const document = useDocumentStore();
const settings = useSettingsStore();
const ui = useUiStore();

const editorPane = ref<{
  getView: () => EditorView | null;
  replaceContent: (text: string) => void;
  captureActiveTabState: () => void;
  restoreActiveTabState: () => void;
  canUndo: boolean;
  canRedo: boolean;
} | null>(null);
const previewPane = ref<{
  getPreviewHost: () => HTMLElement | null;
} | null>(null);
const findPanelRef = ref<{ focusQuery: () => void } | null>(null);
const shortcutsOpen = ref(false);
const workspaceRef = ref<HTMLElement | null>(null);
const dividerRef = ref<HTMLElement | null>(null);

/// The editor's native history availability, surfaced to the toolbar as the
/// Undo/Redo disabled state. The editor-owning component tracks it through its
/// update listener, so these reflect exactly what CodeMirror's own commands
/// would do.
const canUndo = computed(() => editorPane.value?.canUndo ?? false);
const canRedo = computed(() => editorPane.value?.canRedo ?? false);

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

/// Document Controls dispatch order. `saveAs` must be matched before `save`:
/// Save's combo (Ctrl/Cmd+S) also fires when Shift is held, so the more specific
/// Save As combo wins when both would match.
const DOCUMENT_SHORTCUT_ORDER: DocumentControlOperation[] = [
  "saveAs",
  "new",
  "open",
  "save",
  "findReplace",
];

async function runDocumentControl(operation: DocumentControlOperation) {
  switch (operation) {
    case "new":
      await runNewDocument();
      break;
    case "open":
      await runOpenDocument();
      break;
    case "save":
      await document.save();
      break;
    case "saveAs":
      await document.saveAs();
      break;
    case "findReplace":
      onFind();
      break;
  }
}

async function onKeydown(event: KeyboardEvent) {
  if (shortcutsOpen.value && event.key === "Escape") {
    event.preventDefault();
    shortcutsOpen.value = false;
    return;
  }
  const helpCombo = HELP_SHORTCUT.combo;
  if (helpCombo !== null && matchesCombo(event, helpCombo)) {
    event.preventDefault();
    shortcutsOpen.value = !shortcutsOpen.value;
    return;
  }
  for (const operation of DOCUMENT_SHORTCUT_ORDER) {
    const combo = DOCUMENT_SHORTCUTS[operation].combo;
    if (combo !== null && matchesCombo(event, combo)) {
      event.preventDefault();
      await runDocumentControl(operation);
      return;
    }
  }
  for (const operation of Object.keys(FORMAT_SHORTCUTS) as FormatOperation[]) {
    const combo = FORMAT_SHORTCUTS[operation].combo;
    if (combo !== null && matchesCombo(event, combo)) {
      event.preventDefault();
      onFormat(operation);
      return;
    }
  }
  if (matchesCombo(event, CYCLE_LAYOUT_COMBO)) {
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
///
/// The toolbar button has focus when clicked, so the editor is refocused after
/// the dispatch: continued keyboard input (including Cmd/Ctrl+Z undo, which
/// CodeMirror's keymap only serves while the editor is focused) keeps working.
function onFormat(operation: FormatOperation) {
  if (ui.layoutMode === "preview") {
    return;
  }
  const view = editorPane.value?.getView();
  if (view) {
    applyFormatting(view, operation);
    view.focus();
  }
}

/// Applies a Theme chosen from the toolbar. The store persists it, so the next
/// launch restores it; System keeps following the OS via the store's matchMedia
/// resolution.
function onThemeChange(theme: Theme) {
  settings.setTheme(theme);
}

/// Applies a font stack chosen from the toolbar. The store persists it, so the
/// next launch restores it; the app root's data-font drives the CSS variables
/// that both panes consume.
function onFontChange(font: Font) {
  settings.setFont(font);
}

/// Applies a text size chosen from the toolbar. The store persists it, so the
/// next launch restores it; the app root's data-text-size drives the size
/// tokens that both panes consume.
function onTextSizeChange(size: TextSize) {
  settings.setTextSize(size);
}

/// Writes the Document through the same Save flow as the shortcut: an Untitled
/// Document is routed to Save As so it gains a real path.
function onSave() {
  void document.save();
}

function onSaveAs() {
  void document.saveAs();
}

/// Dispatches CodeMirror's native undo/redo commands, the exact commands the
/// `Mod-z` / `Mod-Shift-z` keymap bind, so the buttons and the shortcuts can
/// never disagree. In Preview Only the buttons are hidden, but the shortcuts
/// still reach the mounted editor. The editor is refocused after the dispatch
/// for the same reason as formatting: the clicked button holds focus, and the
/// next keyboard input should land in the editor.
function onUndo() {
  const view = getEditorView();
  if (view) {
    undoCommand(view);
    view.focus();
  }
}

function onRedo() {
  const view = getEditorView();
  if (view) {
    redoCommand(view);
    view.focus();
  }
}

/// Sets the Active Document's Layout Mode from the Layout Switcher. Only the
/// Active Tab's mode changes; every other Tab keeps its own.
function onLayoutChange(mode: LayoutMode) {
  ui.setLayoutMode(mode);
}

/// Toggles the Shortcuts Reference. The Help button in source-visible modes and
/// the `Ctrl/Cmd+/` shortcut both call this, so pressing the button again (or
/// the shortcut again) closes the modal from any Layout Mode.
function onHelp() {
  shortcutsOpen.value = !shortcutsOpen.value;
}

function closeShortcuts() {
  shortcutsOpen.value = false;
}

/// Creates a New Untitled Tab and makes it Active. New never runs the
/// Confirm-Discard Guard: it adds a Tab instead of replacing a Document, so
/// nothing is discarded. The outgoing Tab's editor state is preserved first,
/// so returning to it lands where the user left off; the new Tab starts with
/// a destructive rebuild (empty content, cleared undo history) and the Split
/// View mode its record was created with.
function runNewDocument() {
  editorPane.value?.captureActiveTabState();
  document.newTab();
  ui.findOverlayOpen = false;
  editorPane.value?.replaceContent(document.content);
}

/// Opens the file at `path` in a Tab: a new Tab is added and made Active, or —
/// when the path is already open — the existing Tab is focused instead (one Tab
/// per path). A new Tab carries the auto-chosen Preview Only mode on its
/// record; focusing an already-open Tab makes the window render that Tab's own
/// mode. Shared by the native Open dialog, drag-and-drop, and OS file-open so
/// all use one code path. Never runs the Confirm-Discard Guard.
///
/// The outgoing Tab's editor state is preserved before the workspace switches;
/// focusing an existing Tab restores its preserved state, while a newly opened
/// Tab starts with a destructive rebuild (fresh content, cleared undo history)
/// as today.
async function openPath(path: string) {
  editorPane.value?.captureActiveTabState();
  const result = await document.openPathInTab(path);
  if (result === null) {
    return;
  }
  ui.findOverlayOpen = false;
  if (result === "opened") {
    editorPane.value?.replaceContent(document.content);
  } else {
    // The path was already open: its background Tab became Active again, so it
    // is checked for external changes now. A freshly opened Tab is skipped — its
    // content was just read from disk, so an immediate check could never differ.
    editorPane.value?.restoreActiveTabState();
    void checkActiveTabExternalModification();
  }
}

async function runOpenDocument() {
  const path = await pickOpenPath({
    defaultPath: document.canonicalPath ?? ui.lastDirectory ?? undefined,
  });
  if (path === null) {
    return;
  }
  await openPath(path);
}

/// Activates the Tab at `index` (from the Tab Bar): the outgoing Tab's editor
/// state is captured into its record, the workspace switches the Active Tab,
/// and the editor restores the incoming Tab's preserved state — cursor and
/// undo history travel with the EditorState — plus its scroll offset. The
/// preview and window title follow through their reactive bindings, and the
/// store re-points the `asset://` scope at the Active Document. The now-Active
/// Tab is then checked for external changes (a background Tab is only ever
/// checked the moment it becomes Active).
function onTabActivate(index: number) {
  editorPane.value?.captureActiveTabState();
  if (!document.switchTab(index)) {
    return;
  }
  ui.findOverlayOpen = false;
  editorPane.value?.restoreActiveTabState();
  void checkActiveTabExternalModification();
}

/// Closes the Tab at `index` (from the Tab Bar's close control). A Dirty Tab
/// runs the Confirm-Discard Guard first — Cancel keeps the Tab open,
/// Save/Don't Save close it. Closing the Active Tab activates the Tab to its
/// right, or the new last Tab; closing the last Tab closes the window (the
/// Guard already ran for that Tab, so nothing remains to prompt).
async function onTabClose(index: number) {
  const tab = document.tabs[index];
  if (tab === undefined) {
    return;
  }
  const decision = await confirmDiscard(document.guardDocumentFor(tab));
  if (decision === "cancel") {
    return;
  }
  if (document.tabs.length === 1) {
    // The last Tab closed: close the window. The store keeps the Tab — the
    // workspace must never render empty — and the window (with it) goes away.
    await destroyAppWindow();
    return;
  }
  const wasActive = index === document.activeIndex;
  document.closeTab(index);
  if (wasActive) {
    // A neighbour Tab became Active in the closed Tab's place; it is checked
    // for external changes now, like any Tab that becomes Active.
    ui.findOverlayOpen = false;
    editorPane.value?.restoreActiveTabState();
    void checkActiveTabExternalModification();
  }
}

const appWindow = getCurrentWindow();
let unlistenCloseRequested: (() => void) | null = null;
let unlistenFocusChanged: (() => void) | null = null;
let unlistenDragDrop: (() => void) | null = null;
let unlistenFileOpen: (() => void) | null = null;

/// The window's close request. A window holding any Dirty Tab runs the
/// Confirm-Discard Guard once per Dirty Tab, sequentially — Save writes that
/// Tab, Cancel on any of them aborts the whole close.
async function onCloseRequested(event: { preventDefault: () => void }) {
  if (!document.tabs.some(isTabDirty)) {
    return;
  }
  event.preventDefault();
  for (const tab of document.tabs) {
    if ((await confirmDiscard(document.guardDocumentFor(tab))) === "cancel") {
      return;
    }
  }
  await destroyAppWindow();
}

/// Destroys the window unless the E2E build is running. A wdio run launches a
/// single app instance, so the E2E build keeps the window alive after any
/// close path — the window close request or the last Tab closing — and the
/// suite survives to its next spec.
async function destroyAppWindow() {
  if (import.meta.env.VITE_E2E !== "1") {
    await appWindow.destroy();
  }
}

/// Runs the Externally-Modified check for the Active Tab and pushes a silent or
/// chosen reload into the editor (the authoritative source of edits). Shared by
/// window focus and Tab activation, so a background Tab is only ever checked
/// the moment it becomes Active.
///
/// The store reloads the Tab it captured when the check started; the reload is
/// pushed into the editor only while that Tab is still Active, so a check that
/// overlaps a Tab switch never writes a background Tab's content into the
/// editor. (The reloaded Tab's preserved editor state was already cleared, so
/// switching back to it rebuilds from the on-disk content — nothing is lost.)
async function checkActiveTabExternalModification() {
  const activeIndex = document.activeIndex;
  const replaced = await document.checkExternalModification();
  if (replaced && document.activeIndex === activeIndex) {
    ui.findOverlayOpen = false;
    editorPane.value?.replaceContent(document.content);
  }
}

/// Detects an Externally-Modified file when the window regains focus.
async function onWindowFocused() {
  await checkActiveTabExternalModification();
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
      void openPath(event.payload.paths[0]);
    }
  });
  unlistenFileOpen = await listen<string>("file-open-requested", (event) => {
    void openPath(event.payload);
  });
  // Register the listener before pulling the pending path so a forward that
  // arrives mid-startup is not lost: either the listener or the pull opens it.
  const pendingFile = await invoke<string | null>("get_pending_file");
  if (typeof pendingFile === "string") {
    await openPath(pendingFile);
  }
  if (import.meta.env.VITE_E2E === "1") {
    (globalThis as Record<string, unknown>).__triggerWindowClose = () =>
      appWindow.close();
    (globalThis as Record<string, unknown>).__triggerExternalCheck = () =>
      onWindowFocused();
    (globalThis as Record<string, unknown>).__triggerDrop = (path: string) =>
      void openPath(path);
    (globalThis as Record<string, unknown>).__triggerFileOpen = (
      path: string,
    ) => void openPath(path);
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
