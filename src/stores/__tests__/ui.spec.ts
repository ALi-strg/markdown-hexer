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

  it("cycles Split View → Preview Only → Focus Mode → Split View", () => {
    const ui = useUiStore();
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("preview");
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("focus");
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("split");
  });

  it("auto-chooses Split View for New and Preview Only for Open when no override", () => {
    const ui = useUiStore();
    ui.applyDocumentLoadMode(true);
    expect(ui.layoutMode).toBe("split");
    ui.applyDocumentLoadMode(false);
    expect(ui.layoutMode).toBe("preview");
  });

  it("lets a manual override win until the next Document load", () => {
    const ui = useUiStore();
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("focus");

    ui.applyDocumentLoadMode(false);
    expect(ui.layoutMode).toBe("focus");

    ui.applyDocumentLoadMode(true);
    expect(ui.layoutMode).toBe("split");
  });

  it("does not persist layout mode across launches", () => {
    const ui = useUiStore();
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("focus");

    setActivePinia(createPinia());
    const fresh = useUiStore();
    expect(fresh.layoutMode).toBe("split");
  });
});
