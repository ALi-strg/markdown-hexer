<template>
  <section class="preview-pane" data-testid="preview-pane">
    <div ref="previewHost" class="preview-host"></div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";

const previewHost = ref<HTMLElement | null>(null);
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
