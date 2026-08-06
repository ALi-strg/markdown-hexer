import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "system" | "light" | "dark";
export type Font = "default";

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<Theme>("system");
  const font = ref<Font>("default");

  return { theme, font };
});
