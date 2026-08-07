import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("remembers the divider position across Layout Mode switches", () => {
    const ui = useUiStore();
    ui.dividerPosition = 0.7;
    ui.cycleLayoutMode();
    expect(ui.dividerPosition).toBe(0.7);
    ui.cycleLayoutMode();
    expect(ui.dividerPosition).toBe(0.7);
    ui.cycleLayoutMode();
    expect(ui.dividerPosition).toBe(0.7);
  });

  it("resets the divider position on launch", () => {
    const ui = useUiStore();
    ui.dividerPosition = 0.7;

    setActivePinia(createPinia());
    const fresh = useUiStore();
    expect(fresh.dividerPosition).toBe(0.5);
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

  it("sets a Layout Mode directly and treats it as a manual override", () => {
    const ui = useUiStore();
    ui.setLayoutMode("preview");
    expect(ui.layoutMode).toBe("preview");

    ui.applyDocumentLoadMode(false);
    expect(ui.layoutMode).toBe("preview");
  });

  it("is a no-op when selecting the current Layout Mode", () => {
    const ui = useUiStore();
    ui.setLayoutMode("split");
    expect(ui.layoutMode).toBe("split");
    expect(ui.manualOverrideActive).toBe(false);
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

  it("switches Preview Only to Split View for a replace", () => {
    const ui = useUiStore();
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("preview");
    ui.showSourceForReplace();
    expect(ui.layoutMode).toBe("split");
  });

  it("leaves a source-visible mode unchanged for a replace", () => {
    const ui = useUiStore();
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("focus");
    ui.showSourceForReplace();
    expect(ui.layoutMode).toBe("focus");
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

  it("starts with no toast and no last-used directory", () => {
    const ui = useUiStore();
    expect(ui.toast).toBeNull();
    expect(ui.lastDirectory).toBeNull();
  });

  it("shows a toast message until it auto-dismisses", () => {
    vi.useFakeTimers();
    try {
      const ui = useUiStore();
      ui.showToast("Save failed");
      expect(ui.toast).toBe("Save failed");

      vi.runAllTimers();
      expect(ui.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces an active toast instead of stacking", () => {
    vi.useFakeTimers();
    try {
      const ui = useUiStore();
      ui.showToast("first");
      ui.showToast("second");
      expect(ui.toast).toBe("second");

      vi.runAllTimers();
      expect(ui.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers the last-used directory from a saved path", () => {
    const ui = useUiStore();
    ui.setLastDirectory("C:\\notes\\drafts\\note.md");
    expect(ui.lastDirectory).toBe("C:/notes/drafts");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
