import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { EditorState } from "@codemirror/state";
import { useDocumentStore, type Tab } from "../document";
import { useUiStore } from "../ui";
import {
  getPreservedTabEditorState,
  preserveTabEditorState,
} from "../../lib/tabEditorState";

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
    untitledNumber: null,
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

  it("adds a fresh Untitled Tab after the Active Tab and makes it Active", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    document.switchTab(1);

    const tab = document.newTab();

    expect(document.tabs).toHaveLength(3);
    expect(document.tabs[2]).toStrictEqual(tab);
    expect(document.activeIndex).toBe(2);
    expect(tab.canonicalPath).toBeNull();
    expect(tab.content).toBe("");
    expect(tab.savedContent).toBe("");
    expect(tab.layoutMode).toBe("split");
    expect(document.dirty).toBe(false);
  });

  it("numbers Untitled Tabs per session, never reusing a number", () => {
    const document = useDocumentStore();
    expect(document.filename).toBe("Untitled.md");

    document.newTab();
    expect(document.filename).toBe("Untitled 2.md");

    document.newTab();
    expect(document.filename).toBe("Untitled 3.md");
  });

  it("clears the asset scope when a new Untitled Tab becomes Active", () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    invokeMock.mockClear();

    document.newTab();

    expect(invokeMock).toHaveBeenCalledWith("set_asset_root", {
      documentPath: null,
    });
  });

  it("re-scopes the asset protocol to the switched Tab's directory", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    invokeMock.mockClear();

    document.switchTab(1);

    expect(invokeMock).toHaveBeenCalledWith("set_asset_root", {
      documentPath: "C:\\notes\\a.md",
    });
  });

  it("opens a file into a new Tab after the Active Tab and makes it Active", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    const result = await document.openPathInTab("C:\\notes\\new.md");

    expect(result).toBe("opened");
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[1].canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.tabs[1].content).toBe("# New file");
    expect(document.tabs[1].layoutMode).toBe("preview");
    expect(document.content).toBe("# New file");
    expect(document.filename).toBe("new.md");
    expect(document.dirty).toBe(false);
  });

  it("focuses the existing Tab when the path is already open, with no duplicate", async () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    document.switchTab(1);

    const result = await document.openPathInTab("C:\\notes\\a.md");

    expect(result).toBe("focused");
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
  });

  it("adds a single Tab when the same path is opened concurrently", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Same");
      }
      return Promise.resolve(undefined);
    });

    // Two opens of a not-yet-open path can overlap (a startup forward racing
    // the pending-file pull, a drop racing a forward): each passes the
    // pre-read duplicate check, so the read must re-check and focus the Tab
    // the other open inserted — one Tab per path even under the race.
    const [first, second] = await Promise.all([
      document.openPathInTab("C:\\notes\\race.md"),
      document.openPathInTab("C:\\notes\\race.md"),
    ]);

    expect([first, second].sort()).toEqual(["focused", "opened"]);
    expect(document.tabs).toHaveLength(2);
    expect(
      document.tabs.filter((tab) => tab.canonicalPath === "C:\\notes\\race.md"),
    ).toHaveLength(1);
    expect(document.activeIndex).toBe(1);
  });

  it("shows a toast and adds no Tab when the read fails", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.reject("not found");
      }
      return Promise.resolve(undefined);
    });
    const ui = useUiStore();

    const result = await document.openPathInTab("C:\\notes\\missing.md");

    expect(result).toBeNull();
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("");
    expect(ui.toast).toContain("not found");
  });

  it("remembers the directory of an opened path", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Hello");
      }
      return Promise.resolve(undefined);
    });

    await document.openPathInTab("C:\\notes\\drafts\\b.md");

    expect(useUiStore().lastDirectory).toBe("C:/notes/drafts");
  });

  it("clears a Tab's preserved editor state when the file is externally reloaded", async () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    document.switchTab(1);
    // A preserved state from an earlier switch away; the on-disk version that
    // replaces the Document makes it stale.
    preserveTabEditorState(
      document.tabs[1],
      EditorState.create({ doc: "" }),
      300,
    );
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(true);
    expect(document.tabs[1].content).toBe("# Changed");
    expect(getPreservedTabEditorState(document.tabs[1])).toBeNull();
  });
});
