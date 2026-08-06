import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "../ui";

describe("ui store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults to Split View", () => {
    const ui = useUiStore();
    expect(ui.layoutMode).toBe("split");
  });

  it("holds a default divider position for Split View", () => {
    const ui = useUiStore();
    expect(ui.dividerPosition).toBe(0.5);
  });

  it("starts with the find overlay closed", () => {
    const ui = useUiStore();
    expect(ui.findOverlayOpen).toBe(false);
  });
});
