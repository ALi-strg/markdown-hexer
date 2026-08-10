import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore, type Tab } from "../document";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../lib/saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

vi.mock("../../lib/externalDialog", () => ({
  pickExternalModificationChoice: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

/// Seeds a second, non-Untitled Tab so switch behaviour can be exercised.
function pushTab(document: ReturnType<typeof useDocumentStore>, path: string) {
  const tab: Tab = {
    content: `# ${path}`,
    canonicalPath: path,
    savedContent: `# ${path}`,
    diskContent: `# ${path}`,
    layoutMode: "preview",
    findQuery: "draft",
    currentMatch: { from: 0, to: 5 },
  };
  document.tabs.push(tab);
  return tab;
}

describe("workspace store model", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it("starts with exactly one Untitled Tab as the Active Tab", () => {
    const document = useDocumentStore();
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
  });

  it("holds each Tab's full session state in the record", () => {
    const document = useDocumentStore();
    const tab = document.tabs[0];
    expect(tab.content).toBe("");
    expect(tab.canonicalPath).toBeNull();
    expect(tab.savedContent).toBe("");
    expect(tab.diskContent).toBeNull();
    expect(tab.layoutMode).toBe("split");
    expect(tab.findQuery).toBe("");
    expect(tab.currentMatch).toBeNull();
  });

  it("keeps the Tab list ordered by insertion", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    pushTab(document, "C:\\notes\\b.md");

    expect(document.tabs.map((tab) => tab.canonicalPath)).toEqual([
      null,
      "C:\\notes\\a.md",
      "C:\\notes\\b.md",
    ]);
  });

  it("switches the Active Tab to a valid index", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");

    expect(document.switchTab(1)).toBe(true);
    expect(document.activeIndex).toBe(1);
  });

  it("ignores a switch below the Tab list bounds", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");

    expect(document.switchTab(-1)).toBe(false);
    expect(document.activeIndex).toBe(0);
  });

  it("ignores a switch above the Tab list bounds", () => {
    const document = useDocumentStore();

    expect(document.switchTab(1)).toBe(false);
    expect(document.activeIndex).toBe(0);
  });

  it("keeps exactly one Active index that is always a valid Tab index", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    pushTab(document, "C:\\notes\\b.md");

    document.switchTab(2);
    expect(document.activeIndex).toBe(2);
    document.switchTab(0);
    expect(document.activeIndex).toBe(0);

    for (let i = 0; i < 4; i++) {
      expect(document.activeIndex).toBeGreaterThanOrEqual(0);
      expect(document.activeIndex).toBeLessThan(document.tabs.length);
      document.switchTab(i);
    }
  });

  it("mirrors the Active Tab through the Document surface", () => {
    const document = useDocumentStore();
    const tab = pushTab(document, "C:\\notes\\b.md");
    document.switchTab(1);

    expect(document.content).toBe(tab.content);
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.filename).toBe("b.md");
    expect(document.title).toBe("b.md — Markdown-Magic");
    expect(document.dirty).toBe(false);
  });

  it("writes the Document surface through to the Active Tab record", () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\b.md";
    document.mirrorContent("# typed");

    const tab = document.tabs[0];
    expect(tab.canonicalPath).toBe("C:\\notes\\b.md");
    expect(tab.content).toBe("# typed");
    expect(document.dirty).toBe(true);
  });
});
