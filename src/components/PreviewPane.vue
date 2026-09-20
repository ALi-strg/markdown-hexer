<template>
  <section class="preview-pane" data-testid="preview-pane">
    <div ref="previewHost" class="preview-host"></div>
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
import { resolveAssetSrc, toAssetUrl } from "../lib/assetUrl";
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
  position: relative;
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

/* Code Copy Button: hover-revealed in the block's top-right corner; stays
   reachable via keyboard focus. Inherits pre's absolute positioning. */
.preview-host :deep(.code-copy-btn) {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--code-border);
  background: var(--surface-color);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 0.1s;
}

.preview-host :deep(pre:hover .code-copy-btn),
.preview-host :deep(.code-copy-btn:focus-visible) {
  opacity: 1;
}

.preview-host :deep(.code-copy-btn svg) {
  display: block;
  stroke: currentColor;
  fill: none;
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
