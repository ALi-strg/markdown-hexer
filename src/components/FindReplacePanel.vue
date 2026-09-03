<template>
  <div
    class="find-panel"
    data-testid="find-panel"
    role="search"
    @keydown.esc="close"
  >
    <input
      ref="queryInput"
      class="find-input"
      data-testid="find-input"
      :value="query"
      placeholder="Find"
      aria-label="Find"
      @input="onQueryInput"
      @keydown.enter="onQueryEnter"
    />
    <button
      type="button"
      class="find-button"
      data-testid="find-prev"
      @click="goPrevious"
    >
      Prev
    </button>
    <button
      type="button"
      class="find-button"
      data-testid="find-next"
      @click="goNext"
    >
      Next
    </button>
    <span v-if="matchInfo" class="match-count" data-testid="match-count" aria-live="polite">
      {{ matchInfo.index }} / {{ matchInfo.total }}
    </span>
    <span class="find-separator" aria-hidden="true"></span>
    <input
      class="find-input"
      data-testid="replace-input"
      :value="replace"
      placeholder="Replace"
      aria-label="Replace"
      @input="onReplaceInput"
      @keydown.enter="onReplaceEnter"
    />
    <button
      type="button"
      class="find-button"
      data-testid="replace-next"
      @click="doReplaceNext"
    >
      Replace
    </button>
    <button
      type="button"
      class="find-button"
      data-testid="replace-all"
      @click="doReplaceAll"
    >
      Replace all
    </button>
    <button
      type="button"
      class="find-close"
      data-testid="find-close"
      aria-label="Close search"
      @click="close"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  closeSearchPanel,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import {
  computeMatchInfo,
  nextMatchAfter,
  prevMatchBefore,
  type MatchInfo,
  type MatchRange,
} from "../lib/findReplace";
import { useDocumentStore } from "../stores/document";
import { useUiStore } from "../stores/ui";

const props = defineProps<{
  getView: () => EditorView | null;
  onMatchVisible?: (view: EditorView, match: MatchRange) => void;
}>();

const ui = useUiStore();
const document = useDocumentStore();

const queryInput = ref<HTMLInputElement | null>(null);
const replace = ref("");
const matchInfo = ref<MatchInfo | null>(null);

/// The query lives on the Active Tab's record: Find & Replace operates on the
/// Active Document only, and each Tab remembers its own query, so switching
/// Tabs swaps the panel to that Tab's state. Typing writes the record and
/// dispatches to the editor (`dispatchQuery`); opening the panel reconciles
/// the record from the editor's preserved search state (`syncFromView`).
const query = computed<string>({
  get: () => document.activeTab().findQuery,
  set: (value) => {
    document.activeTab().findQuery = value;
  },
});

/// The match the overlay currently points at, also on the Active Tab's record
/// so each Tab remembers where its search left off. In Preview Only the Editor
/// Pane is hidden, so the selection is tracked here instead of driving the
/// editor; a source-visible mode mirrors it into the editor's selection.
const currentMatch = computed<MatchRange | null>({
  get: () => document.activeTab().currentMatch,
  set: (match) => {
    document.activeTab().currentMatch = match;
  },
});

/// Tracks the search string last sent to the editor so a change to the replace
/// field alone never re-navigates the selection.
let lastDispatchedSearch = "";

function dispatchSelectionToEditor(view: EditorView, match: MatchRange) {
  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    effects: EditorView.scrollIntoView(match.to),
  });
}

/// The never-edit-blind gate, phase one: Preview Only surfaces the source
/// first — its hidden Editor Pane cannot show highlights or scroll to a
/// match — and the work runs once the pane's `v-show` has settled and Vue
/// has flushed the layout change. Every tracked-match change and every
/// replace flows through here.
function withVisibleSource(run: (view: EditorView) => void) {
  const view = props.getView();
  if (view === null) {
    return;
  }
  ui.showSource();
  nextTick(() => run(view));
}

/// Moves the tracked match onto `match` and drives the editor's selection to
/// it: records the match on the Active Tab immediately, then dispatches the
/// selection through the gate. The match may sit inside a collapsed Section
/// (the editor's own scrollIntoView is then often a no-op and fires no scroll
/// event), so the Section is surfaced directly instead of relying on Synced
/// Scrolling.
function setTrackedMatch(match: MatchRange | null) {
  if (match === null) {
    return;
  }
  currentMatch.value = match;
  withVisibleSource((view) => {
    dispatchSelectionToEditor(view, match);
    props.onMatchVisible?.(view, match);
  });
}

/// Selects the first match of the current query so the match count is
/// meaningful from the moment the user types.
function moveToFirstMatch() {
  const view = props.getView();
  if (!view) {
    return;
  }
  setTrackedMatch(nextMatchAfter(view.state, 0));
}

/// Pushes the tracked match into the editor selection, used right before a
/// replace in Preview Only so the hidden Editor Pane is never edited blind.
function syncSelectionToEditor(view: EditorView) {
  const match = currentMatch.value;
  if (match) {
    dispatchSelectionToEditor(view, match);
  }
}

function dispatchQuery() {
  const view = props.getView();
  if (!view) {
    return;
  }
  const searchChanged = query.value !== lastDispatchedSearch;
  lastDispatchedSearch = query.value;
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ search: query.value, replace: replace.value }),
    ),
  });
  // A new query lands on its first match, so next/previous and the match count
  // are meaningful from the moment the user types.
  if (searchChanged && query.value !== "") {
    moveToFirstMatch();
  }
  updateMatchInfo();
}

function updateMatchInfo() {
  const view = props.getView();
  matchInfo.value = view ? computeMatchInfo(view.state, currentMatch.value) : null;
}

/// Restores the Active Tab's remembered current match when the panel opens, so
/// reopening Find on a Tab returns to the match the user left. A stored match
/// that no longer points at a match of the query (the Document changed, or the
/// query no longer matches it) falls back to the first match, clearing a stale
/// record.
function restoreCurrentMatch(view: EditorView) {
  const stored = document.activeTab().currentMatch;
  const match =
    stored !== null && computeMatchInfo(view.state, stored) !== null
      ? stored
      : nextMatchAfter(view.state, 0);
  if (match === null) {
    document.activeTab().currentMatch = null;
    return;
  }
  setTrackedMatch(match);
}

function syncFromView() {
  const view = props.getView();
  if (!view) {
    return;
  }
  const current = getSearchQuery(view.state);
  query.value = current.search;
  replace.value = current.replace;
  lastDispatchedSearch = current.search;
  restoreCurrentMatch(view);
  updateMatchInfo();
}

function focusQuery() {
  nextTick(() => {
    queryInput.value?.focus();
    queryInput.value?.select();
  });
}

/// Opens (or re-focuses) the panel. Opening Find never edits blind: Preview
/// Only surfaces the source first, whether or not a query exists yet. Every
/// entry — toolbar button, shortcut, re-focus — routes here, so `showSource`
/// is called from this component alone.
function open() {
  ui.showSource();
  focusQuery();
}

function onQueryInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value;
  dispatchQuery();
}

function onReplaceInput(event: Event) {
  replace.value = (event.target as HTMLInputElement).value;
  dispatchQuery();
}

function onQueryEnter(event: KeyboardEvent) {
  event.preventDefault();
  if (event.shiftKey) {
    goPrevious();
  } else {
    goNext();
  }
}

function onReplaceEnter(event: KeyboardEvent) {
  event.preventDefault();
  doReplaceNext();
}

function goNext() {
  const view = props.getView();
  if (!view) {
    return;
  }
  const from = currentMatch.value?.to ?? view.state.selection.main.to;
  setTrackedMatch(nextMatchAfter(view.state, from));
  updateMatchInfo();
}

function goPrevious() {
  const view = props.getView();
  if (!view) {
    return;
  }
  const from = currentMatch.value?.from ?? view.state.selection.main.from;
  setTrackedMatch(prevMatchBefore(view.state, from));
  updateMatchInfo();
}

/// Replacing must never edit hidden text: both replace handlers route through
/// the gate, so Preview Only switches to Split View first and the replacement
/// applies in place once the pane is visible. The match replaceNext lands on
/// is recorded through the same gate navigation uses — there is no second,
/// direct match write.
function doReplaceNext() {
  withVisibleSource((view) => {
    syncSelectionToEditor(view);
    replaceNext(view);
    // replaceNext lands the selection on the next match; mirror it so the
    // count stays in step.
    const selection = view.state.selection.main;
    setTrackedMatch({ from: selection.from, to: selection.to });
    updateMatchInfo();
  });
}

function doReplaceAll() {
  withVisibleSource((view) => {
    syncSelectionToEditor(view);
    replaceAll(view);
    updateMatchInfo();
  });
}

function close() {
  ui.findOverlayOpen = false;
  const view = props.getView();
  if (view) {
    closeSearchPanel(view);
  }
}

const stopDocumentWatch = watch(
  () => document.content,
  () => updateMatchInfo(),
);

onMounted(() => {
  open();
  syncFromView();
});

onBeforeUnmount(() => {
  stopDocumentWatch();
  const view = props.getView();
  if (view) {
    closeSearchPanel(view);
  }
});

defineExpose({ open });
</script>

<style scoped>
.find-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--surface-color, #ffffff);
}

.find-input {
  height: 26px;
  min-width: 120px;
  padding: 0 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
  background: var(--input-background, transparent);
  color: inherit;
  font: inherit;
}

.find-button {
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.find-button:hover {
  background: var(--hover-background, rgba(128, 128, 128, 0.15));
}

.match-count {
  font-size: 0.8rem;
  opacity: 0.7;
  min-width: 3.5em;
  text-align: center;
}

.find-separator {
  width: 1px;
  height: 18px;
  background: var(--border-color, #e0e0e0);
}

.find-close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
</style>
