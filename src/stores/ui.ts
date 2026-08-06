import { defineStore } from "pinia";
import { ref } from "vue";

export type LayoutMode = "split" | "preview" | "focus";

const CYCLE_ORDER: LayoutMode[] = ["split", "preview", "focus"];

export const useUiStore = defineStore("ui", () => {
  const layoutMode = ref<LayoutMode>("split");
  const dividerPosition = ref(0.5);
  const findOverlayOpen = ref(false);
  const manualOverrideActive = ref(false);

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

  return {
    layoutMode,
    dividerPosition,
    findOverlayOpen,
    manualOverrideActive,
    cycleLayoutMode,
    applyDocumentLoadMode,
  };
});
