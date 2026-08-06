import { defineStore } from "pinia";
import { ref } from "vue";

export type LayoutMode = "split" | "preview" | "focus";

export const useUiStore = defineStore("ui", () => {
  const layoutMode = ref<LayoutMode>("split");
  const dividerPosition = ref(0.5);
  const findOverlayOpen = ref(false);

  return { layoutMode, dividerPosition, findOverlayOpen };
});
