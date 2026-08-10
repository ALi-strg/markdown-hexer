import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "../ui";
import { useDocumentStore, type Tab } from "../document";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

/// Seeds a second, non-Untitled Tab (Preview Only) so switch behaviour can be
/// exercised against a Tab whose mode differs from the launch Tab's Split.
function pushTab(path: string): Tab {
  const tab: Tab = {
    content: `# ${path}`,
    canonicalPath: path,
    savedContent: `# ${path}`,
    diskContent: `# ${path}`,
    layoutMode: "preview",
    findQuery: "",
    currentMatch: null,
    untitledNumber: null,
  };
  useDocumentStore().tabs.push(tab);
  return tab;
}

describe("ui store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
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

  it("keeps the divider position app-wide across Tabs", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    ui.dividerPosition = 0.7;
    pushTab("C:\\notes\\a.md");

    document.switchTab(1);
    expect(ui.dividerPosition).toBe(0.7);

    document.switchTab(0);
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

  it("cycles the Active Document's modes Split → Preview → Focus → Split", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    pushTab("C:\\notes\\a.md");
    document.switchTab(1);
    expect(ui.layoutMode).toBe("preview"); // the pushed Tab's own mode

    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("focus");
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("split");
    ui.cycleLayoutMode();
    expect(ui.layoutMode).toBe("preview");

    // Only the Active Tab's record moved; the launch Tab is untouched.
    expect(document.tabs[0].layoutMode).toBe("split");
  });

  it("sets a Layout Mode directly on the Active Document only", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    ui.setLayoutMode("preview");
    expect(ui.layoutMode).toBe("preview");
    expect(document.activeTab().layoutMode).toBe("preview");
    expect(document.tabs[0].layoutMode).toBe("preview");
  });

  it("is a no-op when selecting the current Layout Mode", () => {
    const ui = useUiStore();
    ui.setLayoutMode("split");
    expect(ui.layoutMode).toBe("split");
  });

  it("renders the switched Tab's own mode on switch", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    pushTab("C:\\notes\\a.md"); // Preview Only

    document.switchTab(1);
    expect(ui.layoutMode).toBe("preview");

    document.switchTab(0);
    expect(ui.layoutMode).toBe("split");

    document.switchTab(1);
    expect(ui.layoutMode).toBe("preview");
  });

  it("keeps a Tab's chosen mode across switches away and back", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    pushTab("C:\\notes\\a.md");
    document.switchTab(1);

    ui.cycleLayoutMode(); // a.md: Preview → Focus
    expect(ui.layoutMode).toBe("focus");

    document.switchTab(0);
    expect(ui.layoutMode).toBe("split"); // launch Tab keeps Split

    document.switchTab(1);
    expect(ui.layoutMode).toBe("focus"); // a.md keeps Focus
  });

  it("switches Preview Only to Split View for a replace", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    pushTab("C:\\notes\\a.md");
    document.switchTab(1);
    expect(ui.layoutMode).toBe("preview");
    ui.showSourceForReplace();
    expect(ui.layoutMode).toBe("split");
  });

  it("leaves a source-visible mode unchanged for a replace", () => {
    const ui = useUiStore();
    const document = useDocumentStore();
    pushTab("C:\\notes\\a.md");
    document.switchTab(1);
    ui.cycleLayoutMode(); // a.md: Preview → Focus
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
