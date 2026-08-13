import { defineStore } from "pinia";
import { computed, ref } from "vue";

/// The appearance preference: System, which resolves to the Light or Dark
/// Palette, or one of the five Palettes directly.
export type Theme =
  | "system"
  | "light"
  | "dark"
  | "high-contrast"
  | "nord"
  | "terminal-green";

/// A concrete color scheme. The app root's `data-theme` always carries one of
/// these, never "system": System is a preference, not a rendered Palette.
export type Palette = Exclude<Theme, "system">;

/// The shared text size preference for both panes. Medium is the default look.
export type TextSize = "small" | "medium" | "large";

export type Font = "default" | "serif" | "sans" | "mono";

export const THEMES: Theme[] = [
  "system",
  "light",
  "dark",
  "high-contrast",
  "nord",
  "terminal-green",
];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  "high-contrast": "High Contrast",
  nord: "Nord",
  "terminal-green": "Terminal Green",
};

export const TEXT_SIZES: TextSize[] = ["small", "medium", "large"];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const FONTS: Font[] = ["default", "serif", "sans", "mono"];
export const FONT_LABELS: Record<Font, string> = {
  default: "Default",
  serif: "Serif",
  sans: "Sans",
  mono: "Mono",
};

const SETTINGS_STORAGE_KEY = "markdownhexer:settings";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

function isTextSize(value: unknown): value is TextSize {
  return typeof value === "string" && (TEXT_SIZES as string[]).includes(value);
}

function isFont(value: unknown): value is Font {
  return typeof value === "string" && (FONTS as string[]).includes(value);
}

interface StoredSettings {
  theme?: unknown;
  font?: unknown;
  textSize?: unknown;
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

/// Reads the persisted text size, falling back to Medium when the blob is
/// absent, corrupt, or holds an unknown value.
function readStoredTextSize(): TextSize {
  const parsed = readStoredSettings();
  return isTextSize(parsed.textSize) ? parsed.textSize : "medium";
}

/// Merges a single setting into the persisted blob so the Theme, the font, and
/// the text size survive each other's writes.
function writeStoredSettings(patch: Partial<StoredSettings>) {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...readStoredSettings(), ...patch }),
  );
}

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<Theme>(readStoredTheme());
  const font = ref<Font>(readStoredFont());
  const textSize = ref<TextSize>(readStoredTextSize());

  /// The OS dark-mode query. Environments without matchMedia (jsdom) resolve
  /// System to Light.
  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  const darkMode = ref(darkQuery?.matches ?? false);

  /// The Palette actually rendered: a chosen Theme directly, System resolved
  /// against the live OS preference.
  const resolvedTheme = computed<Palette>(() =>
    theme.value === "system"
      ? (darkMode.value ? "dark" : "light")
      : theme.value,
  );

  // Keep System live-following the OS for the app's lifetime.
  darkQuery?.addEventListener("change", (event: MediaQueryListEvent) => {
    darkMode.value = event.matches;
  });

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

  /// Sets the text size and persists it so the next launch restores it.
  function setTextSize(next: TextSize) {
    textSize.value = next;
    writeStoredSettings({ textSize: next });
  }

  return {
    theme,
    resolvedTheme,
    font,
    textSize,
    setTheme,
    setFont,
    setTextSize,
  };
});
