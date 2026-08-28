<template>
  <nav
    class="tab-bar"
    data-testid="tab-bar"
    aria-label="Open Documents"
    @dragover.prevent
    @drop.prevent="onDropAtEnd"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.canonicalPath ?? `untitled-${tab.untitledNumber}`"
      class="tab"
      :class="{ active: index === activeIndex, dragging: index === dragIndex }"
      :title="tab.canonicalPath ?? undefined"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragover.prevent.stop="onDragOver(index)"
      @drop.prevent.stop
      @dragend="dragIndex = null"
    >
      <button
        type="button"
        class="tab-activate"
        data-testid="tab"
        role="tab"
        :aria-selected="index === activeIndex"
        :aria-label="tabLabel(tab)"
        @click="emit('activate', index)"
      >
        <span class="tab-label">{{ tabLabel(tab) }}</span>
        <span v-if="isTabDirty(tab)" class="tab-dirty" data-testid="tab-dirty">*</span>
      </button>
      <button
        type="button"
        class="tab-close"
        data-testid="tab-close"
        :aria-label="`Close ${tabDisplayName(tab)}`"
        @click="emit('close', index)"
      >
        ×
      </button>
    </div>
    <button
      type="button"
      class="tab-new"
      data-testid="tab-new"
      :title="tooltipText(DOCUMENT_SHORTCUTS.new)"
      @click="emit('new')"
    >
      +
    </button>
    <!-- The nav itself is the drop zone for the empty strip right of the
         last Tab (and the `+` button): a drop there moves the dragged Tab
         to the end. The per-Tab handlers stop propagation, so these nav
         handlers only fire over the strip. -->
  </nav>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Tab } from "../stores/document";
import { isTabDirty, tabDisplayName } from "../stores/document";
import { DOCUMENT_SHORTCUTS, tooltipText } from "../lib/shortcuts";

const props = defineProps<{
  tabs: Tab[];
  activeIndex: number;
}>();

const emit = defineEmits<{
  activate: [index: number];
  close: [index: number];
  move: [from: number, to: number];
  new: [];
}>();

/// The 0-based index of the Tab being dragged, or null between drags. The
/// store reorders live on every crossed boundary (the `move` emit), so this
/// tracks where the dragged Tab currently sits, never where it started.
const dragIndex = ref<number | null>(null);

/// Starts a drag of the Tab at `index`. A dataTransfer entry is required for
/// Firefox to fire any drag events at all; the content is irrelevant because
/// the reorder is positional.
function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index;
  event.dataTransfer?.setData("text/plain", "");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

/// Reorders live while dragging: crossing onto another Tab emits one `move`
/// (the store's no-op guard swallows repeats at dragover rate). Dropping is
/// deliberately not a separate step — the order is already correct, and an
/// aborted drag (Esc, drop outside) leaves it where the drag left it.
function onDragOver(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) {
    return;
  }
  emit("move", dragIndex.value, index);
  dragIndex.value = index;
}

function onDropAtEnd() {
  const last = props.tabs.length - 1;
  if (dragIndex.value !== null && dragIndex.value !== last) {
    emit("move", dragIndex.value, last);
    dragIndex.value = last;
  }
}

/// The name of the parent folder of the Document, e.g. `drafts` for
/// `C:\notes\drafts\a.md`. Null for a root-level or Untitled Document: a
/// drive letter (`C:`) or a bare separator is a root, not a folder name.
function parentFolder(tab: Tab): string | null {
  const path = tab.canonicalPath;
  if (path === null) {
    return null;
  }
  const parts = path.replace(/[\\/][^\\/]+$/, "").split(/[\\/]/);
  const last = parts[parts.length - 1];
  if (last === undefined || last.length === 0 || /^[A-Za-z]:$/.test(last)) {
    return null;
  }
  return last;
}

/// The Tab label: the Document's filename, with the parent folder appended when
/// two open Documents share a basename so the Tabs stay distinguishable
/// (`a.md`, `a.md — notes`).
function tabLabel(tab: Tab): string {
  const name = tabDisplayName(tab);
  const sharingBasename = props.tabs.filter(
    (other) => tabDisplayName(other) === name,
  );
  if (sharingBasename.length <= 1) {
    return name;
  }
  const folder = parentFolder(tab);
  return folder === null ? name : `${name} — ${folder}`;
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex: 0 0 auto;
  padding: 4px 6px 0;
  background: var(--surface-color, #ffffff);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  overflow-x: auto;
}

.tab {
  display: inline-flex;
  align-items: stretch;
  max-width: 220px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-color);
  font-size: 0.85rem;
  white-space: nowrap;
}

.tab.dragging {
  opacity: 0.5;
}

.tab:hover {
  background: var(--hover-background, rgba(128, 128, 128, 0.15));
}

.tab.active {
  background: var(--background-color);
  border-color: var(--border-color, #e0e0e0);
}

/* The clickable label fills the Tab; the close control sits at its right. */
.tab-activate {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.tab.active .tab-activate {
  font-weight: 600;
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dirty {
  color: var(--accent-color, #888);
  font-weight: 700;
}

.tab-close {
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-color);
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
}

.tab-close:hover {
  background: rgba(128, 128, 128, 0.2);
}

.tab-new {
  align-self: center;
  width: 28px;
  height: 28px;
  margin-left: 2px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-color);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.tab-new:hover {
  background: var(--hover-background, rgba(128, 128, 128, 0.12));
}
</style>
