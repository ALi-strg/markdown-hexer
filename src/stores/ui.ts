import { defineStore } from "pinia";
import { ref } from "vue";

export type LayoutMode = "split" | "preview" | "focus";

const CYCLE_ORDER: LayoutMode[] = ["split", "preview", "focus"];
const TOAST_DURATION_MS = 4000;

export const useUiStore = defineStore("ui", () => {
  const layoutMode = ref<LayoutMode>("split");
  const dividerPosition = ref(0.5);
  const findOverlayOpen = ref(false);
  const manualOverrideActive = ref(false);
  const lastDirectory = ref<string | null>(null);
  const toast = ref<string | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function cycleLayoutMode() {
    const index = CYCLE_ORDER.indexOf(layoutMode.value);
    layoutMode.value = CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length];
    manualOverrideActive.value = true;
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
    applyDocumentLoadMode,
    showSourceForReplace,
    showToast,
    setLastDirectory,
  };
});
