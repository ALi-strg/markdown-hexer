<template>
  <div class="toolbar" data-testid="toolbar" role="toolbar">
    <div
      class="toolbar-format-group"
      v-show="layoutMode !== 'preview'"
    >
      <button
        type="button"
        class="toolbar-button toolbar-bold"
        data-testid="toolbar-bold"
        :title="tooltipText(FORMAT_SHORTCUTS.bold)"
        @click="emit('format', 'bold')"
      >
        B
      </button>
      <button
        type="button"
        class="toolbar-button toolbar-italic"
        data-testid="toolbar-italic"
        :title="tooltipText(FORMAT_SHORTCUTS.italic)"
        @click="emit('format', 'italic')"
      >
        I
      </button>
      <span class="toolbar-separator" aria-hidden="true"></span>
      <button
        type="button"
        class="toolbar-button"
        data-testid="toolbar-heading"
        :title="tooltipText(FORMAT_SHORTCUTS.heading)"
        @click="emit('format', 'heading')"
      >
        #
      </button>
      <button
        type="button"
        class="toolbar-button"
        data-testid="toolbar-list"
        :title="tooltipText(FORMAT_SHORTCUTS.list)"
        @click="emit('format', 'list')"
      >
        -
      </button>
      <button
        type="button"
        class="toolbar-button"
        data-testid="toolbar-link"
        :title="tooltipText(FORMAT_SHORTCUTS.link)"
        @click="emit('format', 'link')"
      >
        Link
      </button>
      <button
        type="button"
        class="toolbar-button"
        data-testid="toolbar-code"
        :title="tooltipText(FORMAT_SHORTCUTS.code)"
        @click="emit('format', 'code')"
      >
        Code
      </button>
    </div>
    <span class="toolbar-spacer" aria-hidden="true"></span>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <label class="toolbar-theme-label" for="toolbar-theme">Theme</label>
    <select
      id="toolbar-theme"
      class="toolbar-theme"
      data-testid="toolbar-theme"
      :value="theme"
      :title="tooltipText(THEME_CONTROL)"
      @change="onThemeChange"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <label class="toolbar-font-label" for="toolbar-font">Font</label>
    <select
      id="toolbar-font"
      class="toolbar-font"
      data-testid="toolbar-font"
      :value="font"
      :title="tooltipText(FONT_CONTROL)"
      @change="onFontChange"
    >
      <option v-for="option in FONTS" :key="option" :value="option">
        {{ FONT_LABELS[option] }}
      </option>
    </select>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <div
      class="layout-switcher"
      role="group"
      aria-label="Layout"
      data-testid="layout-switcher"
    >
      <button
        v-for="mode in LAYOUT_MODES"
        :key="mode"
        type="button"
        class="layout-switch"
        :class="{ active: layoutMode === mode }"
        :data-testid="`layout-${mode}`"
        :aria-pressed="layoutMode === mode"
        :title="layoutTooltip(mode)"
        @click="emit('layoutChange', mode)"
      >
        {{ LAYOUT_LABELS[mode] }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FormatOperation } from "../lib/formatting";
import {
  CYCLE_LAYOUT_COMBO,
  FONT_CONTROL,
  FORMAT_SHORTCUTS,
  THEME_CONTROL,
  tooltipText,
  tooltipWithCombo,
} from "../lib/shortcuts";
import { FONTS, FONT_LABELS, type Font, type Theme } from "../stores/settings";
import { LAYOUT_MODES, type LayoutMode } from "../stores/ui";

const LAYOUT_LABELS: Record<LayoutMode, string> = {
  split: "Split",
  preview: "Preview",
  focus: "Focus",
};

function layoutTooltip(mode: LayoutMode): string {
  return tooltipWithCombo(`Switch to ${LAYOUT_LABELS[mode]}`, CYCLE_LAYOUT_COMBO);
}

defineProps<{
  layoutMode: LayoutMode;
  theme: Theme;
  font: Font;
}>();
const emit = defineEmits<{
  format: [operation: FormatOperation];
  themeChange: [theme: Theme];
  fontChange: [font: Font];
  layoutChange: [mode: LayoutMode];
}>();

function onThemeChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "system" || value === "light" || value === "dark") {
    emit("themeChange", value);
  }
}

function onFontChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if ((FONTS as string[]).includes(value)) {
    emit("fontChange", value as Font);
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
  background: var(--surface-color, #ffffff);
  user-select: none;
}

.toolbar-format-group {
  display: flex;
  align-items: center;
  gap: 4px;
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
  transition: background-color 0.12s ease;
}

.toolbar-button:hover {
  background: var(--hover-background, rgba(128, 128, 128, 0.15));
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

.toolbar-theme,
.toolbar-font {
  height: 26px;
  padding: 0 4px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  background: var(--input-background, #ffffff);
  color: var(--text-color, inherit);
  font-size: 0.85rem;
}

/* The opened popup is drawn by the OS, so the option rows get explicit
   background/text colors too (the color-scheme on the app root already tells
   Chromium which native palette to use in dark mode). */
.toolbar-theme option,
.toolbar-font option {
  background: var(--input-background, #ffffff);
  color: var(--text-color, inherit);
}

.toolbar-font-label {
  font-size: 0.8rem;
  color: var(--text-color, inherit);
  margin-left: 8px;
  margin-right: 4px;
}

.layout-switcher {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: var(--input-background, transparent);
}

.layout-switch {
  height: 22px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, var(--text-color, inherit));
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.layout-switch:hover {
  background: var(--hover-background, rgba(128, 128, 128, 0.15));
  color: var(--text-color, inherit);
}

.layout-switch.active {
  background: var(--accent-color, #888);
  color: var(--accent-contrast-color, #fff);
}
</style>
