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

const render = debounce(() => {
  const host = previewHost.value;
  if (host) {
    host.innerHTML = renderMarkdown(document.content, { wrapBlocks: true });
    rewriteAssetSrcs(host);
    props.onRender?.();
  }
}, RENDER_DEBOUNCE_MS);

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
</style>
