import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "../settings";

/// Stubs `window.matchMedia` (absent in jsdom) so the store's System
/// resolution can be driven from the tests. Returns a handle whose `setDark`
/// flips the mocked OS preference and fires the registered change listeners,
/// exactly like a real `prefers-color-scheme` change.
function mockSystemDark(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener(
      type: string,
      listener: (event: { matches: boolean }) => void,
    ) {
      if (type === "change") {
        listeners.add(listener);
      }
    },
    removeEventListener() {},
    setDark(next: boolean) {
      query.matches = next;
      for (const listener of listeners) {
        listener({ matches: next });
      }
    },
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return query;
}

describe("settings store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("defaults to the System theme", () => {
    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("defaults to a curated font choice for both panes", () => {
    const settings = useSettingsStore();
    expect(settings.font).toBe("default");
  });

  it("changes the font and persists it to localStorage", () => {
    const settings = useSettingsStore();
    settings.setFont("mono");
    expect(settings.font).toBe("mono");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ font: "mono" }),
    );
  });

  it("changes the theme and persists it to localStorage", () => {
    const settings = useSettingsStore();
    settings.setTheme("dark");
    expect(settings.theme).toBe("dark");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ theme: "dark" }),
    );
  });

  it("restores a persisted font on the next launch", () => {
    localStorage.setItem("markdownhexer:settings", JSON.stringify({ font: "serif" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.font).toBe("serif");
  });

  it("restores a persisted theme on the next launch", () => {
    localStorage.setItem("markdownhexer:settings", JSON.stringify({ theme: "light" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("light");
  });

  it("falls back to Default for an unknown persisted font", () => {
    localStorage.setItem("markdownhexer:settings", JSON.stringify({ font: "comic" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.font).toBe("default");
  });

  it("keeps the font when the theme is set after it", () => {
    const settings = useSettingsStore();
    settings.setFont("mono");
    settings.setTheme("dark");
    expect(settings.font).toBe("mono");
    expect(settings.theme).toBe("dark");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ font: "mono", theme: "dark" }),
    );
  });

  it("keeps the theme when the font is set after it", () => {
    const settings = useSettingsStore();
    settings.setTheme("light");
    settings.setFont("serif");
    expect(settings.theme).toBe("light");
    expect(settings.font).toBe("serif");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ theme: "light", font: "serif" }),
    );
  });

  it("falls back to System for an unknown persisted theme", () => {
    localStorage.setItem("markdownhexer:settings", JSON.stringify({ theme: "neon" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("falls back to System when the persisted blob is corrupt", () => {
    localStorage.setItem("markdownhexer:settings", "not json{{{");
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("stays System when nothing has been persisted", () => {
    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("defaults to the Medium text size", () => {
    const settings = useSettingsStore();
    expect(settings.textSize).toBe("medium");
  });

  it("changes the text size and persists it to localStorage", () => {
    const settings = useSettingsStore();
    settings.setTextSize("large");
    expect(settings.textSize).toBe("large");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ textSize: "large" }),
    );
  });

  it("restores a persisted text size on the next launch", () => {
    localStorage.setItem(
      "markdownhexer:settings",
      JSON.stringify({ textSize: "small" }),
    );
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.textSize).toBe("small");
  });

  it("falls back to Medium for an unknown persisted text size", () => {
    localStorage.setItem(
      "markdownhexer:settings",
      JSON.stringify({ textSize: "huge" }),
    );
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.textSize).toBe("medium");
  });

  it("keeps the theme when the text size is set after it", () => {
    const settings = useSettingsStore();
    settings.setTheme("nord");
    settings.setTextSize("large");
    expect(settings.theme).toBe("nord");
    expect(settings.textSize).toBe("large");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ theme: "nord", textSize: "large" }),
    );
  });

  it("accepts a palette theme beyond Light and Dark", () => {
    const settings = useSettingsStore();
    settings.setTheme("high-contrast");
    expect(settings.theme).toBe("high-contrast");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ theme: "high-contrast" }),
    );
  });

  it("resolves System to Light when the OS prefers light", () => {
    mockSystemDark(false);
    const settings = useSettingsStore();
    expect(settings.resolvedTheme).toBe("light");
  });

  it("resolves System to Dark when the OS prefers dark", () => {
    mockSystemDark(true);
    const settings = useSettingsStore();
    expect(settings.resolvedTheme).toBe("dark");
  });

  it("follows a live OS preference change", () => {
    const media = mockSystemDark(false);
    const settings = useSettingsStore();
    expect(settings.resolvedTheme).toBe("light");
    media.setDark(true);
    expect(settings.resolvedTheme).toBe("dark");
  });

  it("resolves a chosen Palette directly, ignoring the OS", () => {
    mockSystemDark(true);
    const settings = useSettingsStore();
    settings.setTheme("nord");
    expect(settings.resolvedTheme).toBe("nord");
  });

  it("resolves System back after a Palette is cleared", () => {
    mockSystemDark(false);
    const settings = useSettingsStore();
    settings.setTheme("terminal-green");
    expect(settings.resolvedTheme).toBe("terminal-green");
    settings.setTheme("system");
    expect(settings.resolvedTheme).toBe("light");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
