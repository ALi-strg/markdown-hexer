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
import { pickSavePath } from "../../lib/saveDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);

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
    pickSavePathMock.mockReset();
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

  it("opens a file into a Tab that starts with empty Find & Replace state", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    // Consuming the empty launch Tab still produces a fresh file Tab.
    await document.openPathInTab("C:\\notes\\new.md");

    expect(document.tabs[0].findQuery).toBe("");
    expect(document.tabs[0].currentMatch).toBeNull();
  });

  it("creates a new Untitled Tab with empty Find & Replace state", () => {
    const document = useDocumentStore();

    document.newTab();

    expect(document.tabs[1].findQuery).toBe("");
    expect(document.tabs[1].currentMatch).toBeNull();
  });

  it("keeps each Tab's Find & Replace state with the Tab across switches", () => {
    const document = useDocumentStore();
    const launch = document.tabs[0];
    launch.findQuery = "alpha";
    launch.currentMatch = { from: 11, to: 16 };
    const other = pushTab(document, "C:\\notes\\b.md");
    other.findQuery = "beta";
    other.currentMatch = { from: 0, to: 4 };

    document.switchTab(1);
    document.switchTab(0);

    // Switching neither shares nor clobbers Find state: every Tab keeps its
    // own query and current match for the session.
    expect(launch.findQuery).toBe("alpha");
    expect(launch.currentMatch).toEqual({ from: 11, to: 16 });
    expect(other.findQuery).toBe("beta");
    expect(other.currentMatch).toEqual({ from: 0, to: 4 });
  });

  it("numbers Untitled Tabs per session, never reusing a number", () => {
    const document = useDocumentStore();
    expect(document.filename).toBe("Untitled.md");

    document.newTab();
    expect(document.filename).toBe("Untitled 2.md");

    document.newTab();
    expect(document.filename).toBe("Untitled 3.md");
  });

  it("restarts Untitled numbering at 1 when no Untitled Tab is open", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });
    // Consuming the launch Tab removes the only Untitled Tab in the workspace.
    await document.openPathInTab("C:\\notes\\new.md");
    expect(document.tabs.some((tab) => tab.untitledNumber !== null)).toBe(false);

    document.newTab();

    // No Untitled Tab is open, so numbering restarts at Untitled.md.
    expect(document.filename).toBe("Untitled.md");
    expect(document.tabs[1].untitledNumber).toBe(1);
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

  it("consumes a sole empty Untitled Tab when a file is opened", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    const result = await document.openPathInTab("C:\\notes\\new.md");

    expect(result).toBe("opened");
    // The opened file replaces the empty launch Tab in place: the workspace
    // holds the file alone, not the file stacked behind an empty Untitled Tab.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.tabs[0].canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.tabs[0].content).toBe("# New file");
    expect(document.tabs[0].layoutMode).toBe("preview");
    expect(document.tabs[0].untitledNumber).toBeNull();
    expect(document.content).toBe("# New file");
    expect(document.filename).toBe("new.md");
    expect(document.dirty).toBe(false);
  });

  it("adds a second Tab when the sole Tab is a Dirty Untitled Document", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Draft");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    const result = await document.openPathInTab("C:\\notes\\new.md");

    expect(result).toBe("opened");
    // Typed content is never silently discarded: a Dirty Untitled Tab is not
    // consumed, so the file lands in a second Tab.
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[0].content).toBe("# Draft");
    expect(document.tabs[1].canonicalPath).toBe("C:\\notes\\new.md");
  });

  it("adds a Tab when a real file Tab is already open", async () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\a.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    const result = await document.openPathInTab("C:\\notes\\new.md");

    expect(result).toBe("opened");
    // The empty Untitled Tab is no longer the sole Tab, so nothing is consumed;
    // the file lands in a new Tab right after the Active launch Tab.
    expect(document.tabs).toHaveLength(3);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[1].canonicalPath).toBe("C:\\notes\\new.md");
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
    // One of the two consumes the sole empty launch Tab; the other focuses it.
    expect(document.tabs).toHaveLength(1);
    expect(
      document.tabs.filter((tab) => tab.canonicalPath === "C:\\notes\\race.md"),
    ).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
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

  it("removes a background Tab and leaves the Active Tab alone", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\b.md");
    document.closeTab(1);
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
  });

  it("activates the Tab to the right when the Active Tab closes", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\b.md");
    pushTab(document, "C:\\notes\\c.md");
    document.switchTab(1); // b.md Active
    document.closeTab(1);
    expect(document.tabs.map((tab) => tab.canonicalPath)).toEqual([
      null,
      "C:\\notes\\c.md",
    ]);
    expect(document.activeIndex).toBe(1); // c.md takes b.md's place
  });

  it("activates the new last Tab when the last Tab closes", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\b.md");
    document.switchTab(1);
    document.closeTab(1);
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
  });

  it("shifts the Active index down when a Tab to its left closes", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\b.md");
    pushTab(document, "C:\\notes\\c.md");
    document.switchTab(2); // c.md Active
    document.closeTab(0);
    expect(document.tabs.map((tab) => tab.canonicalPath)).toEqual([
      "C:\\notes\\b.md",
      "C:\\notes\\c.md",
    ]);
    expect(document.activeIndex).toBe(1);
  });

  it("keeps the last remaining Tab so the workspace never renders empty", () => {
    const document = useDocumentStore();
    document.closeTab(0);
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
  });

  it("ignores closing a Tab index outside the workspace", () => {
    const document = useDocumentStore();
    pushTab(document, "C:\\notes\\b.md");
    document.closeTab(5);
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(0);
  });

  it("builds the Guard's view of a Tab: Dirty flag, filename, and a save targeting that Tab", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# launch edits");
    const background = pushTab(document, "C:\\notes\\b.md");
    background.content = "# b edits";

    const guard = document.guardDocumentFor(background);
    expect(guard.dirty).toBe(true);
    expect(guard.filename).toBe("b.md");

    expect(await guard.save()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\b.md",
      content: "# b edits",
    });
    expect(background.savedContent).toBe("# b edits");
    // The Active Tab is untouched.
    expect(document.content).toBe("# launch edits");
    expect(document.dirty).toBe(true);
  });

  it("builds a clean Guard view for a clean Tab", () => {
    const document = useDocumentStore();
    const guard = document.guardDocumentFor(document.tabs[0]);
    expect(guard.dirty).toBe(false);
    expect(guard.filename).toBe("Untitled.md");
  });

  it("routes a background Untitled Tab's Guard save through Save As", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# launch edits");
    const untitled = document.newTab();
    untitled.content = "# untitled edits";
    document.switchTab(0); // launch Tab Active again; Untitled 2 stays dirty

    const guard = document.guardDocumentFor(untitled);
    pickSavePathMock.mockResolvedValue("C:\\notes\\saved.md");
    expect(await guard.save()).toBe(true);
    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\saved.md",
      content: "# untitled edits",
    });
    expect(untitled.canonicalPath).toBe("C:\\notes\\saved.md");
    expect(untitled.savedContent).toBe("# untitled edits");
  });

  it("refuses Save As to a path already open in another Tab and keeps the Tab pathless", async () => {
    const document = useDocumentStore();
    const ui = useUiStore();
    document.mirrorContent("# launch edits");
    pushTab(document, "C:\\notes\\taken.md");
    pickSavePathMock.mockResolvedValue("C:\\notes\\taken.md");

    const saved = await document.saveAs();

    expect(saved).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
    expect(document.tabs[0].canonicalPath).toBeNull();
    expect(document.filename).toBe("Untitled.md");
    expect(document.dirty).toBe(true);
    expect(ui.toast).toContain("already open");
  });

  it("allows Save As re-selecting the Document's own canonical path", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# v1");
    // A sibling Tab holds a different path: only the self-exclusion (the Tab
    // doing the Save As is not "another Tab") lets the write through.
    pushTab(document, "C:\\notes\\b.md");
    pickSavePathMock.mockResolvedValue("C:\\notes\\a.md");

    const saved = await document.saveAs();

    expect(saved).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# v1",
    });
    expect(document.tabs[0].canonicalPath).toBe("C:\\notes\\a.md");
  });

  it("saves to an unused path and updates the Tab label and window title", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pushTab(document, "C:\\notes\\b.md");
    pickSavePathMock.mockResolvedValue("C:\\notes\\free.md");

    const saved = await document.saveAs();

    expect(saved).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\free.md",
      content: "# Hello",
    });
    expect(document.tabs[0].canonicalPath).toBe("C:\\notes\\free.md");
    expect(document.filename).toBe("free.md");
    expect(document.title).toBe("free.md — Markdown-Magic");
    expect(document.tabs[0].untitledNumber).toBeNull();
  });

  it("refuses a background Untitled Tab's Guard Save As onto an open path", async () => {
    const document = useDocumentStore();
    const ui = useUiStore();
    document.mirrorContent("# launch edits");
    pushTab(document, "C:\\notes\\taken.md");
    const untitled = document.newTab();
    untitled.content = "# untitled edits";
    document.switchTab(0);
    pickSavePathMock.mockResolvedValue("C:\\notes\\taken.md");

    const guard = document.guardDocumentFor(untitled);
    const saved = await guard.save();

    expect(saved).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
    expect(untitled.canonicalPath).toBeNull();
    expect(untitled.untitledNumber).not.toBeNull();
    expect(ui.toast).toContain("already open");
  });
});
