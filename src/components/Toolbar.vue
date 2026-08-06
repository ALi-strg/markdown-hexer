<template>
  <div class="toolbar" data-testid="toolbar" role="toolbar">
    <button
      type="button"
      class="toolbar-button toolbar-bold"
      data-testid="toolbar-bold"
      title="Bold (Ctrl/Cmd+B)"
      :disabled="disabled"
      @click="emit('format', 'bold')"
    >
      B
    </button>
    <button
      type="button"
      class="toolbar-button toolbar-italic"
      data-testid="toolbar-italic"
      title="Italic (Ctrl/Cmd+I)"
      :disabled="disabled"
      @click="emit('format', 'italic')"
    >
      I
    </button>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <button
      type="button"
      class="toolbar-button"
      data-testid="toolbar-heading"
      title="Heading"
      :disabled="disabled"
      @click="emit('format', 'heading')"
    >
      #
    </button>
    <button
      type="button"
      class="toolbar-button"
      data-testid="toolbar-list"
      title="List"
      :disabled="disabled"
      @click="emit('format', 'list')"
    >
      -
    </button>
    <button
      type="button"
      class="toolbar-button"
      data-testid="toolbar-link"
      title="Link"
      :disabled="disabled"
      @click="emit('format', 'link')"
    >
      Link
    </button>
    <button
      type="button"
      class="toolbar-button"
      data-testid="toolbar-code"
      title="Code"
      :disabled="disabled"
      @click="emit('format', 'code')"
    >
      Code
    </button>
    <span class="toolbar-spacer" aria-hidden="true"></span>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <label class="toolbar-theme-label" for="toolbar-theme">Theme</label>
    <select
      id="toolbar-theme"
      class="toolbar-theme"
      data-testid="toolbar-theme"
      :value="theme"
      title="Theme"
      @change="onThemeChange"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { FormatOperation } from "../lib/formatting";
import type { Theme } from "../stores/settings";

defineProps<{ disabled: boolean; theme: Theme }>();
const emit = defineEmits<{
  format: [operation: FormatOperation];
  themeChange: [theme: Theme];
}>();

function onThemeChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "system" || value === "light" || value === "dark") {
    emit("themeChange", value);
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--toolbar-background, transparent);
  user-select: none;
}

.toolbar-button {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
}

.toolbar-button:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.15);
}

.toolbar-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.toolbar-bold {
  font-weight: 700;
}

.toolbar-italic {
  font-style: italic;
}

.toolbar-separator {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border-color, #e0e0e0);
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-theme-label {
  font-size: 0.8rem;
  color: var(--text-color, inherit);
  margin-right: 4px;
}

.toolbar-theme {
  height: 26px;
  padding: 0 4px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  background: var(--input-background, transparent);
  color: var(--text-color, inherit);
  font-size: 0.85rem;
}
</style>
