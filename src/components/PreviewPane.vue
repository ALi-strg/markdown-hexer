<template>
  <section class="preview-pane" data-testid="preview-pane">
    <div ref="previewHost" class="preview-host"></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { debounce } from "../lib/debounce";
import { renderMarkdown } from "../lib/renderer";
import { useDocumentStore } from "../stores/document";

const RENDER_DEBOUNCE_MS = 200;

const document = useDocumentStore();
const previewHost = ref<HTMLElement | null>(null);

const render = debounce(() => {
  if (previewHost.value) {
    previewHost.value.innerHTML = renderMarkdown(document.content);
  }
}, RENDER_DEBOUNCE_MS);

watch(() => document.content, render, { immediate: true });

onBeforeUnmount(() => {
  render.cancel();
});
</script>

<style scoped>
.preview-pane {
  min-width: 0;
  height: 100%;
  overflow: auto;
}

.preview-host {
  min-height: 100%;
  padding: var(--pane-padding);
  font-family: var(--preview-font-family);
  font-size: var(--preview-font-size);
  line-height: 1.7;
  color: var(--text-color);
}
</style>
