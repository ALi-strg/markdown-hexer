<template>
  <section class="preview-pane" data-testid="preview-pane">
    <div ref="previewHost" class="preview-host md-content"></div>
    <div
      v-if="copyToast"
      class="copy-toast"
      :style="{ left: `${copyToast.x}px`, top: `${copyToast.y}px` }"
      role="status"
      data-testid="copy-toast"
    >
      Copied to clipboard
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { debounce } from "../lib/debounce";
import { renderMarkdown } from "../lib/renderer";
import { applyCollapsedSections, toggleSection } from "../lib/sections";
import { rewriteAssetSrcs } from "../lib/assetUrl";
import { useDocumentStore } from "../stores/document";
import { useUiStore } from "../stores/ui";

const props = defineProps<{ onRender?: () => void }>();

const RENDER_DEBOUNCE_MS = 200;

const document = useDocumentStore();
const ui = useUiStore();
const previewHost = ref<HTMLElement | null>(null);

const COPY_TOAST_MS = 1500;

/// Overlapping-rectangles copy icon; empty textContent keeps it out of
/// Selection.toString() so a Copy-on-Select drag over it copies nothing extra.
const COPY_ICON =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="3.5" y="0.5" width="8" height="8" rx="1"/><rect x="0.5" y="3.5" width="8" height="8" rx="1"/></svg>';

/// Position of the Copy Toast, or null while it is hidden.
const copyToast = ref<{ x: number; y: number } | null>(null);
let copyToastTimer: ReturnType<typeof setTimeout> | undefined;

/// Writes text to the clipboard, falling back to the legacy execCommand path
/// for webviews without the async Clipboard API. Throws when both fail.
async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = globalThis.document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    globalThis.document.body.appendChild(textarea);
    textarea.select();
    const ok = globalThis.document.execCommand("copy");
    textarea.remove();
    if (!ok) {
      throw new Error("copy failed");
    }
  }
}

/// Shows the Copy Toast below-right of the cursor, clamped to the viewport
/// (+12/+16 offsets below-right; 160/40 = toast footprint for the clamp).
/// Re-anchors (replaces, never stacks) on repeated copies.
function showCopyToast(x: number, y: number) {
  copyToast.value = {
    x: Math.max(8, Math.min(x + 12, window.innerWidth - 160)),
    y: Math.max(8, Math.min(y + 16, window.innerHeight - 40)),
  };
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => {
    copyToast.value = null;
    copyToastTimer = undefined;
  }, COPY_TOAST_MS);
}

/// Copies text and confirms it: Copy Toast on success, app-wide error toast
/// on failure. The single seam shared by Copy-on-Select and the Code Copy
/// Button.
async function copyAndConfirm(text: string, x: number, y: number) {
  try {
    await writeClipboard(text);
    showCopyToast(x, y);
  } catch {
    ui.showToast("Copy to clipboard failed");
  }
}

/// Copy-on-Select: a mouse selection that ends in the Preview Pane is copied
/// as plain text and confirmed with the Copy Toast. Mouse-up is the only
/// trigger — a double-click's word selection is already in place at its
/// second mouse-up, so a dblclick hook would only double-fire. Keyboard copy
/// stays silent; the WebView handles it natively.
function onSelectionMouseup(event: MouseEvent) {
  if (event.button !== 0) {
    return; // only a primary-button mouse-up ends a selection gesture
  }
  const host = previewHost.value;
  const selection = globalThis.getSelection();
  if (!host || !selection || selection.isCollapsed) {
    return;
  }
  if (selection.anchorNode === null || !containsNode(host, selection.anchorNode)) {
    return;
  }
  const text = selection.toString();
  if (text.length === 0) {
    return;
  }
  void copyAndConfirm(text, event.clientX, event.clientY);
}

/// Adds a Code Copy Button to every fenced code block. Buttons are attached
/// after sanitization (they never come from the Markdown pipeline) and are
/// recreated on every render together with the rest of the content.
function addCodeCopyButtons(host: HTMLElement) {
  for (const pre of host.querySelectorAll("pre")) {
    const button = globalThis.document.createElement("button");
    button.type = "button";
    button.className = "code-copy-btn";
    button.title = "Copy code";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = COPY_ICON;
    pre.appendChild(button);
  }
}

function renderNow() {
  const host = previewHost.value;
  if (host) {
    host.innerHTML = renderMarkdown(document.content, { wrapBlocks: true });
    rewriteAssetSrcs(host, document.canonicalPath);
    addCodeCopyButtons(host);
    applyCollapsedSections(host, document.activeTab().collapsedSections);
    props.onRender?.();
  }
}

const render = debounce(renderNow, RENDER_DEBOUNCE_MS);

/// Toggles a Section from its chevron (the DOM flip lives in the Section seam)
/// and records the state on the Active Tab so it survives re-renders.
function onToggleSection(chevron: HTMLElement) {
  const result = toggleSection(chevron);
  if (result === null) {
    return;
  }
  const tab = document.activeTab();
  tab.collapsedSections = result.collapsed
    ? [...tab.collapsedSections, result.key]
    : tab.collapsedSections.filter((existing) => existing !== result.key);
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
  const copyButton = (event.target as HTMLElement | null)?.closest(
    ".code-copy-btn",
  );
  if (copyButton instanceof HTMLElement) {
    const pre = copyButton.closest("pre");
    const text = (pre?.querySelector("code") ?? pre)?.textContent ?? "";
    if (text.length > 0) {
      // Keyboard activation (Enter/Space) clicks with no pointer position;
      // anchor the toast at the button instead of (0, 0).
      let { clientX: x, clientY: y } = event;
      if (event.detail === 0) {
        const rect = copyButton.getBoundingClientRect();
        x = rect.left;
        y = rect.top;
      }
      void copyAndConfirm(text.replace(/\n$/, ""), x, y);
    }
    return;
  }
  const chevron = (event.target as HTMLElement | null)?.closest(".md-chevron");
  if (chevron instanceof HTMLElement) {
    onToggleSection(chevron);
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
  previewHost.value?.addEventListener("mouseup", onSelectionMouseup);
});

onBeforeUnmount(() => {
  render.cancel();
  const host = previewHost.value;
  host?.removeEventListener("click", onPreviewClick);
  host?.removeEventListener("mouseup", onSelectionMouseup);
  clearTimeout(copyToastTimer);
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
  -webkit-user-select: text;
  user-select: text;
}

/* Copy Toast: transient copy confirmation near the cursor; never intercepts
   clicks. Reuses the theme's toast tokens (distinct from the app-wide toast). */
.copy-toast {
  position: fixed;
  padding: 6px 10px;
  background: var(--toast-background, #333);
  color: var(--toast-color, #fff);
  font-size: 0.8rem;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
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
  font-size: 0.7em;
  transition: transform 0.12s ease;
}

.preview-host :deep(
    .md-section:not(.md-section-collapsed) > .md-section-head .md-chevron
  ) {
  transform: rotate(90deg);
}

.preview-host :deep(.md-section-collapsed > .md-section-body) {
  display: none;
}
</style>
