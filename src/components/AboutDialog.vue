<template>
  <div
    class="about-overlay"
    data-testid="about-overlay"
    @click.self="emit('close')"
  >
    <div
      ref="modalRef"
      class="about-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      tabindex="-1"
      data-testid="about-modal"
    >
      <header class="about-header">
        <img :src="appIcon" alt="" class="about-icon" />
        <h2 id="about-title" class="about-title">About Markdown Hexer</h2>
        <p v-if="version" class="about-version" data-testid="about-version">
          Version {{ version }}
        </p>
        <a
          class="about-repo-link"
          data-testid="about-repo-link"
          :href="REPO_URL"
          @click.prevent="onOpenRepository"
        >
          GitHub repository
        </a>
      </header>
      <div class="about-groups">
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
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { comboLabel, SHORTCUT_GROUPS } from "../lib/shortcuts";
import appIcon from "../../src-tauri/icons/128x128.png";

const emit = defineEmits<{ close: [] }>();

/// The product's repository. Opened in the default browser via the opener
/// plugin, never inside the app window.
const REPO_URL = "https://github.com/ALi-strg/markdown-hexer";

/// The Version the running bundle carries — the release tag on shipped builds
/// (CI strips the leading `v`), the static dev baseline in development. Read
/// from the backend so the About Dialog can never drift from the bundle it
/// rides in. A failed read leaves the line hidden: the version is
/// informational, never worth an error toast.
const version = ref("");
onMounted(async () => {
  try {
    version.value = await invoke<string>("get_app_version");
  } catch {
    // Informational; the dialog still renders without the version line.
  }
});

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

function onOpenRepository() {
  void openUrl(REPO_URL);
}
</script>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.4);
}

.about-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 560px;
  max-height: 80vh;
  padding: 20px 24px;
  border: 1px solid var(--border-color, #d8dde3);
  border-radius: 0;
  background: var(--surface-color, #ffffff);
  color: var(--text-color, inherit);
  overflow-y: auto;
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.about-icon {
  width: 72px;
  height: 72px;
  border-radius: 0;
}

.about-title {
  margin: 6px 0 0;
  font-size: 1.1rem;
}

.about-version {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted, inherit);
}

.about-repo-link {
  margin-top: 4px;
  font-size: 0.9rem;
  color: var(--accent-color, #1a73e8);
}

.about-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 24px;
  border-top: 1px solid var(--border-color, #d8dde3);
  padding-top: 16px;
}

.shortcut-group-title {
  margin: 0 0 6px;
  font: 11px/1.2 monospace;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--link-color, var(--text-muted, inherit));
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
  border-radius: 0;
  background: var(--input-background, #ffffff);
  font-family: var(--editor-font-family, monospace);
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
