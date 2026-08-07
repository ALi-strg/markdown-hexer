import { defineStore } from "pinia";
import { ref } from "vue";

export type LayoutMode = "split" | "preview" | "focus";

/// The canonical Layout Mode order, shared by the cycle shortcut and the
/// Layout Switcher segments so the two can never disagree.
export const LAYOUT_MODES: LayoutMode[] = ["split", "preview", "focus"];

const TOAST_DURATION_MS = 4000;

export const useUiStore = defineStore("ui", () => {
  const layoutMode = ref<LayoutMode>("split");
  const dividerPosition = ref(0.5);
  const findOverlayOpen = ref(false);
  const manualOverrideActive = ref(false);
  const lastDirectory = ref<string | null>(null);
  const toast = ref<string | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  /// Applies a manually chosen Layout Mode and marks it as an override,
  /// authoritative until the next Document load.
  function applyManualMode(next: LayoutMode) {
    layoutMode.value = next;
    manualOverrideActive.value = true;
  }

  function cycleLayoutMode() {
    const index = LAYOUT_MODES.indexOf(layoutMode.value);
    applyManualMode(LAYOUT_MODES[(index + 1) % LAYOUT_MODES.length]);
  }

  /// Sets the Layout Mode directly from the Layout Switcher. Selecting the
  /// current mode changes nothing; any real selection is a manual override,
  /// authoritative until the next Document load.
  function setLayoutMode(next: LayoutMode) {
    if (next === layoutMode.value) {
      return;
    }
    applyManualMode(next);
  }

  function applyDocumentLoadMode(isNew: boolean) {
    if (manualOverrideActive.value) {
      manualOverrideActive.value = false;
      return;
    }
    layoutMode.value = isNew ? "split" : "preview";
  }

  /// Makes the source visible so a replace never edits hidden text: Preview
  /// Only gives way to Split View, while source-visible modes are unchanged.
  /// The switch is a one-off accommodation, not a manual override.
  function showSourceForReplace() {
    if (layoutMode.value === "preview") {
      layoutMode.value = "split";
    }
  }

  function showToast(message: string) {
    toast.value = message;
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.value = null;
      toastTimer = null;
    }, TOAST_DURATION_MS);
  }

  function setLastDirectory(path: string) {
    const parts = path.split(/[\\/]/);
    parts.pop();
    lastDirectory.value = parts.join("/") || null;
  }

  return {
    layoutMode,
    dividerPosition,
    findOverlayOpen,
    manualOverrideActive,
    lastDirectory,
    toast,
    cycleLayoutMode,
    setLayoutMode,
    applyDocumentLoadMode,
    showSourceForReplace,
    showToast,
    setLastDirectory,
  };
});
