import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "../settings";

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
    expect(localStorage.getItem("markdownmagic:settings")).toBe(
      JSON.stringify({ font: "mono" }),
    );
  });

  it("changes the theme and persists it to localStorage", () => {
    const settings = useSettingsStore();
    settings.setTheme("dark");
    expect(settings.theme).toBe("dark");
    expect(localStorage.getItem("markdownmagic:settings")).toBe(
      JSON.stringify({ theme: "dark" }),
    );
  });

  it("restores a persisted font on the next launch", () => {
    localStorage.setItem("markdownmagic:settings", JSON.stringify({ font: "serif" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.font).toBe("serif");
  });

  it("restores a persisted theme on the next launch", () => {
    localStorage.setItem("markdownmagic:settings", JSON.stringify({ theme: "light" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("light");
  });

  it("falls back to Default for an unknown persisted font", () => {
    localStorage.setItem("markdownmagic:settings", JSON.stringify({ font: "comic" }));
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
    expect(localStorage.getItem("markdownmagic:settings")).toBe(
      JSON.stringify({ font: "mono", theme: "dark" }),
    );
  });

  it("keeps the theme when the font is set after it", () => {
    const settings = useSettingsStore();
    settings.setTheme("light");
    settings.setFont("serif");
    expect(settings.theme).toBe("light");
    expect(settings.font).toBe("serif");
    expect(localStorage.getItem("markdownmagic:settings")).toBe(
      JSON.stringify({ theme: "light", font: "serif" }),
    );
  });

  it("falls back to System for an unknown persisted theme", () => {
    localStorage.setItem("markdownmagic:settings", JSON.stringify({ theme: "neon" }));
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("falls back to System when the persisted blob is corrupt", () => {
    localStorage.setItem("markdownmagic:settings", "not json{{{");
    setActivePinia(createPinia());

    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });

  it("stays System when nothing has been persisted", () => {
    const settings = useSettingsStore();
    expect(settings.theme).toBe("system");
  });
});
