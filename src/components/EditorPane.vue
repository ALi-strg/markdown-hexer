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
import { createTabSession } from "../lib/tabEditorState";

const props = defineProps<{
  /// Runs after a successful Tab swap, before the incoming Tab's editor state
  /// lands — the app closes the Find & Replace overlay here.
  onSwitched?: () => void;
  /// Runs after a Tab switch restored the incoming Tab's preserved state —
  /// the app checks that Tab for external changes here.
  onRestored?: () => void;
}>();

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

/// Whether the editor pane is currently visible. The pane is `v-show`-hidden
/// in Preview Only (`v-show` toggles the inline display style, so the check
/// reads `el.style.display` — the same value a browser layout would compute);
/// a hidden pane has no layout, so its scroll offset reads 0 and writing one
/// into it no-ops.
function paneVisible(): boolean {
  const pane = paneRef.value;
  return pane !== null && pane.style.display !== "none";
}

/// The Tab-switch session: capture/restore/rebuild of the editor state per
/// Tab. The mechanics live in the session controller (unit-tested against a
/// fake view); this component supplies the view, the pane's visibility, and
/// state creation — the extensions live here.
const tabSession = createTabSession({
  getView: () => view.value,
  getActiveTab: () => document.activeTab(),
  isPaneVisible: paneVisible,
  getContent: () => document.content,
  createState: createEditorState,
  onHistorySync: syncHistoryState,
  onSwitched: props.onSwitched,
  onRestored: props.onRestored,
});

/// Applies a scroll offset deferred while the pane was hidden. The pane's
/// visibility is driven by the Layout Mode (`v-show` in App.vue hides it in
/// Preview Only); `flush: "post"` runs after the mode's DOM update, so the
/// pane actually has layout when the offset is written.
watch(
  () => ui.layoutMode,
  () => {
    nextTick(() => {
      tabSession.flushPendingScroll();
    });
  },
  { flush: "post" },
);

defineExpose({
  getView: () => view.value,
  tabSession,
  canUndo,
  canRedo,
});

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
