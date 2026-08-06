import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "system" | "light" | "dark";
export type Font = "default";

const THEMES: Theme[] = ["system", "light", "dark"];

const SETTINGS_STORAGE_KEY = "alimd:settings";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

interface StoredSettings {
  theme?: unknown;
}

/// Reads the persisted theme, falling back to System when the blob is absent,
/// corrupt, or holds an unknown value. Slice 17 will add the font alongside.
function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) {
      return "system";
    }
    const parsed = JSON.parse(raw) as StoredSettings;
    return isTheme(parsed.theme) ? parsed.theme : "system";
  } catch {
    return "system";
  }
}

function writeStoredTheme(theme: Theme) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme }));
}

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<Theme>(readStoredTheme());
  const font = ref<Font>("default");

  /// Sets the Theme preference and persists it so the next launch restores it.
  function setTheme(next: Theme) {
    theme.value = next;
    writeStoredTheme(next);
  }

  return { theme, font, setTheme };
});
