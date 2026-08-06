import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "system" | "light" | "dark";
export type Font = "default" | "serif" | "sans" | "mono";

export const FONTS: Font[] = ["default", "serif", "sans", "mono"];
export const FONT_LABELS: Record<Font, string> = {
  default: "Default",
  serif: "Serif",
  sans: "Sans",
  mono: "Mono",
};

const THEMES: Theme[] = ["system", "light", "dark"];

const SETTINGS_STORAGE_KEY = "alimd:settings";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

function isFont(value: unknown): value is Font {
  return typeof value === "string" && (FONTS as string[]).includes(value);
}

interface StoredSettings {
  theme?: unknown;
  font?: unknown;
}

/// Reads the persisted blob, returning an empty object when it is absent or
/// corrupt so callers can apply their own defaults.
function readStoredSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw === null ? {} : (JSON.parse(raw) as StoredSettings);
  } catch {
    return {};
  }
}

/// Reads the persisted theme, falling back to System when the blob is absent,
/// corrupt, or holds an unknown value.
function readStoredTheme(): Theme {
  const parsed = readStoredSettings();
  return isTheme(parsed.theme) ? parsed.theme : "system";
}

/// Reads the persisted font, falling back to Default when the blob is absent,
/// corrupt, or holds an unknown value.
function readStoredFont(): Font {
  const parsed = readStoredSettings();
  return isFont(parsed.font) ? parsed.font : "default";
}

/// Merges a single setting into the persisted blob so the Theme and the font
/// survive each other's writes.
function writeStoredSettings(patch: Partial<StoredSettings>) {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...readStoredSettings(), ...patch }),
  );
}

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<Theme>(readStoredTheme());
  const font = ref<Font>(readStoredFont());

  /// Sets the Theme preference and persists it so the next launch restores it.
  function setTheme(next: Theme) {
    theme.value = next;
    writeStoredSettings({ theme: next });
  }

  /// Sets the font choice and persists it so the next launch restores it.
  function setFont(next: Font) {
    font.value = next;
    writeStoredSettings({ font: next });
  }

  return { theme, font, setTheme, setFont };
});
