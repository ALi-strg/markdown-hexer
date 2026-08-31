<template>
  <section class="preview-pane" data-testid="preview-pane">
    <div ref="previewHost" class="preview-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { debounce } from "../lib/debounce";
import { renderMarkdown } from "../lib/renderer";
import { setSectionCollapsed, SECTION_COLLAPSED_CLASS } from "../lib/sections";
import { resolveAssetSrc, toAssetUrl } from "../lib/assetUrl";
import { useDocumentStore } from "../stores/document";

const props = defineProps<{ onRender?: () => void }>();

const RENDER_DEBOUNCE_MS = 200;

const document = useDocumentStore();
const previewHost = ref<HTMLElement | null>(null);

/// The directory a relative image resolves against: the directory holding the
/// Document. An Untitled Document has no directory, so nothing is rewritten.
function assetBase(): string | null {
  if (document.canonicalPath === null) {
    return null;
  }
  return document.canonicalPath.replace(/[\\/][^\\/]+$/, "");
}

/// Rewrites relative `<img>` srcs in the rendered output to the scoped
/// `asset://` URLs that resolve against the Document's directory. External
/// srcs (absolute URLs, data URIs, ...) are left untouched.
function rewriteAssetSrcs(host: HTMLElement) {
  const base = assetBase();
  if (base === null) {
    return;
  }
  for (const img of host.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src === null) {
      continue;
    }
    const absolute = resolveAssetSrc(src, base);
    if (absolute !== null) {
      img.setAttribute("src", toAssetUrl(absolute));
    }
  }
}

function renderNow() {
  const host = previewHost.value;
  if (host) {
    host.innerHTML = renderMarkdown(document.content, { wrapBlocks: true });
    rewriteAssetSrcs(host);
    applyCollapsedSections(host);
    props.onRender?.();
  }
}

const render = debounce(renderNow, RENDER_DEBOUNCE_MS);

/// Re-applies the Active Tab's collapsed Sections after a render. Sections are
/// matched by key, so state survives edits that shift block positions.
function applyCollapsedSections(host: HTMLElement) {
  for (const key of document.activeTab().collapsedSections) {
    const section = host.querySelector(
      `.md-section[data-section-key="${CSS.escape(key)}"]`,
    );
    if (section instanceof HTMLElement) {
      setSectionCollapsed(section, true);
    }
  }
}

/// Toggles a Section from its chevron: flips the collapsed class on the
/// Section and records the state on the Active Tab so it survives re-renders.
function toggleSection(chevron: HTMLElement) {
  const section = chevron.closest(".md-section");
  if (!(section instanceof HTMLElement)) {
    return;
  }
  const collapsed = !section.classList.contains(SECTION_COLLAPSED_CLASS);
  setSectionCollapsed(section, collapsed);
  const key = section.dataset.sectionKey;
  if (key === undefined) {
    return;
  }
  const tab = document.activeTab();
  tab.collapsedSections = collapsed
    ? [...tab.collapsedSections, key]
    : tab.collapsedSections.filter((existing) => existing !== key);
}

function containsNode(node: Node | null, other: Node): boolean {
  return (
    node !== null &&
    "contains" in node &&
    typeof node.contains === "function" &&
    node.contains(other)
  );
}

/// Whether a non-collapsed text selection touches the clicked anchor. Dragging
/// to select text usually ends with a click on the same element; that click is
/// a selection gesture, not a navigation, so it must not open the browser.
function selectionOverlapsAnchor(anchor: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  if (!selection || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return (
    containsNode(anchor, range.startContainer) ||
    containsNode(anchor, range.endContainer)
  );
}

/// Opens preview links in the system browser instead of navigating the webview.
/// Text selection and copy keep working: a click that lands on a selection in
/// progress is left alone.
function onPreviewClick(event: MouseEvent) {
  const chevron = (event.target as HTMLElement | null)?.closest(".md-chevron");
  if (chevron instanceof HTMLElement) {
    toggleSection(chevron);
    return;
  }
  const anchor = (event.target as HTMLElement | null)?.closest("a");
  if (anchor === null || anchor === undefined) {
    return;
  }
  const href = anchor.getAttribute("href");
  if (href === null || href === "") {
    return;
  }
  if (event.button !== 0 || event.defaultPrevented) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  if (selectionOverlapsAnchor(anchor)) {
    return;
  }
  event.preventDefault();
  void openUrl(href);
}

watch(
  () => [document.content, document.canonicalPath],
  render,
  { immediate: true },
);

/// A Tab switch must swap the Preview Pane to the incoming Tab's content and
/// collapsed Sections immediately, so the debounced render is cancelled and
/// replaced by a synchronous one.
watch(
  () => document.activeIndex,
  () => {
    render.cancel();
    renderNow();
  },
);

onMounted(() => {
  previewHost.value?.addEventListener("click", onPreviewClick);
});

onBeforeUnmount(() => {
  render.cancel();
  previewHost.value?.removeEventListener("click", onPreviewClick);
});

defineExpose({ getPreviewHost: () => previewHost.value });
</script>

<style scoped>
.preview-pane {
  min-width: 0;
  height: 100%;
}

.preview-host {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: var(--pane-padding);
  font-family: var(--preview-font-family);
  font-size: var(--preview-font-size);
  line-height: 1.7;
  color: var(--text-color);
  -webkit-user-select: text;
  user-select: text;
}

/* Clean minimal typography for the rendered Markdown. The preview HTML is
   injected into .preview-host, so every element needs :deep() to be styled.
   Spacing uses rem (root-relative) so block offsets stay integer device
   pixels across DPI scales — em margins on resized heading fonts produce
   fractional offsets that drift under subpixel scroll. */
.preview-host :deep(h1),
.preview-host :deep(h2),
.preview-host :deep(h3),
.preview-host :deep(h4),
.preview-host :deep(h5),
.preview-host :deep(h6) {
  color: var(--text-color);
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.preview-host :deep(h1) {
  font-size: 1.7em;
}

.preview-host :deep(h2) {
  font-size: 1.4em;
}

.preview-host :deep(h3) {
  font-size: 1.2em;
}

.preview-host :deep(h4),
.preview-host :deep(h5),
.preview-host :deep(h6) {
  font-size: 1.05em;
}

.preview-host :deep(p) {
  margin: 0.5rem 0;
}

.preview-host :deep(a) {
  color: var(--link-color);
  text-decoration: none;
}

.preview-host :deep(a:hover) {
  text-decoration: underline;
}

.preview-host :deep(code) {
  background: var(--code-background);
  border: 1px solid var(--code-border);
  border-radius: 0;
  padding: 0.1em 0.3em;
  font-size: 0.9em;
}

.preview-host :deep(pre) {
  background: var(--code-background);
  border: 1px solid var(--code-border);
  border-radius: 0;
  padding: 0.8rem 1rem;
  overflow-x: auto;
  line-height: 1.5;
}

.preview-host :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.9em;
}

.preview-host :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.15rem 0.9rem;
  border-left: 3px solid var(--blockquote-border);
  color: var(--blockquote-text);
}

.preview-host :deep(blockquote p) {
  margin: 0.25rem 0;
}

.preview-host :deep(ul),
.preview-host :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.6rem;
}

.preview-host :deep(li) {
  margin: 0.15rem 0;
}

.preview-host :deep(table) {
  border-collapse: collapse;
  margin: 0.75rem 0;
  width: 100%;
}

.preview-host :deep(th),
.preview-host :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.4rem 0.7rem;
  text-align: left;
}

.preview-host :deep(th) {
  background: var(--surface-color);
  font-weight: 600;
}

.preview-host :deep(tbody tr:nth-child(even)) {
  background: var(--table-stripe-background);
}

.preview-host :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1rem 0;
}

.preview-host :deep(img) {
  max-width: 100%;
}

.preview-host :deep(input[type="checkbox"]) {
  margin-right: 0.4rem;
}

/* Sections: a chevron sits in the heading's left margin; collapsing hides
   the Section body (the whole subtree, nested Sections included). */
.preview-host :deep(.md-section-head) {
  position: relative;
}

.preview-host :deep(.md-chevron) {
  position: absolute;
  left: -1.1rem;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1.4rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.preview-host :deep(.md-chevron::before) {
  /* U+25B8 ▸ in CSS escape form; a JS-style "\u25B8" renders as literal text. */
  content: "\25B8";
  font-size: 0.7em;
  transition: transform 0.12s ease;
}

.preview-host :deep(
    .md-section:not(.md-section-collapsed) > .md-section-head .md-chevron::before
  ) {
  transform: rotate(90deg);
}

.preview-host :deep(.md-section-collapsed > .md-section-body) {
  display: none;
}
</style>
