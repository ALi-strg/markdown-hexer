<template>
  <div
    class="shortcuts-overlay"
    data-testid="shortcuts-overlay"
    @click.self="emit('close')"
  >
    <div
      ref="modalRef"
      class="shortcuts-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabindex="-1"
      data-testid="shortcuts-modal"
    >
      <h2 id="shortcuts-title" class="shortcuts-title">Shortcuts Reference</h2>
      <div class="shortcuts-groups">
        <section
          v-for="group in SHORTCUT_GROUPS"
          :key="group.label"
          class="shortcut-group"
          :data-testid="`shortcut-group-${group.label.toLowerCase()}`"
        >
          <h3 class="shortcut-group-title">{{ group.label }}</h3>
          <ul class="shortcut-entries">
            <li
              v-for="entry in group.entries"
              :key="entry.label"
              class="shortcut-entry"
            >
              <span class="shortcut-name">{{ entry.label }}</span>
              <kbd v-if="entry.combo !== null" class="shortcut-keys">{{
                comboLabel(entry.combo)
              }}</kbd>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { comboLabel, SHORTCUT_GROUPS } from "../lib/shortcuts";

const emit = defineEmits<{ close: [] }>();

/// Moves focus into the dialog when it opens and restores it on dismissal, so
/// the modal semantics stay honest: Tab no longer lands on the toolbar/editor
/// behind the overlay, and Esc returns focus where it was.
const modalRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  modalRef.value?.focus();
});

onBeforeUnmount(() => {
  previouslyFocused?.focus();
});
</script>

<style scoped>
.shortcuts-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.4);
}

.shortcuts-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
  max-height: 80vh;
  padding: 20px 24px;
  border: 1px solid var(--border-color, #d8dde3);
  border-radius: 8px;
  background: var(--surface-color, #ffffff);
  color: var(--text-color, inherit);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  overflow-y: auto;
}

.shortcuts-title {
  margin: 0;
  font-size: 1.1rem;
}

.shortcuts-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 24px;
}

.shortcut-group-title {
  margin: 0 0 6px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, inherit);
}

.shortcut-entries {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shortcut-entry {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.9rem;
}

.shortcut-keys {
  padding: 1px 6px;
  border: 1px solid var(--border-color, #d8dde3);
  border-radius: 4px;
  background: var(--input-background, #ffffff);
  font-family: var(--editor-font-family, monospace);
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
