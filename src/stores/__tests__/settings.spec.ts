import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "../settings";

describe("settings store", () => {
  beforeEach(() => {
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
});
