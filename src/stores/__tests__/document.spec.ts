import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore } from "../document";
import { useUiStore } from "../ui";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../lib/saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../../lib/saveDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);

describe("document store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    pickSavePathMock.mockReset();
  });

  it("starts as an untitled, clean, empty Document", () => {
    const document = useDocumentStore();
    expect(document.content).toBe("");
    expect(document.canonicalPath).toBeNull();
    expect(document.dirty).toBe(false);
  });

  it("shows Untitled.md as the filename when there is no canonical path", () => {
    const document = useDocumentStore();
    expect(document.filename).toBe("Untitled.md");
  });

  it("derives the window title from the filename", () => {
    const document = useDocumentStore();
    expect(document.title).toBe("Untitled.md — ALi-md-editor");
  });

  it("mirrors editor text and marks the Document Dirty on the first keystroke", () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    expect(document.content).toBe("# Hello");
    expect(document.dirty).toBe(true);
  });

  it("stays Dirty while content differs from the saved baseline", () => {
    const document = useDocumentStore();
    document.mirrorContent("a");
    document.mirrorContent("ab");
    expect(document.dirty).toBe(true);
  });

  it("clears Dirty when content returns to the saved baseline", () => {
    const document = useDocumentStore();
    document.mirrorContent("hello");
    document.mirrorContent("");
    expect(document.dirty).toBe(false);
  });

  it("shows the asterisk in the title while Dirty and removes it when clean", () => {
    const document = useDocumentStore();
    document.mirrorContent("hello");
    expect(document.title).toBe("Untitled.md * — ALi-md-editor");
    document.mirrorContent("");
    expect(document.title).toBe("Untitled.md — ALi-md-editor");
  });

  it("writes a titled Dirty Document to its canonical path and clears Dirty", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");

    const saved = await document.save();

    expect(saved).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(document.dirty).toBe(false);
  });

  it("behaves as Save As for an Untitled Document", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue("C:\\notes\\b.md");

    const saved = await document.save();

    expect(saved).toBe(true);
    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\b.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.filename).toBe("b.md");
    expect(document.dirty).toBe(false);
  });

  it("keeps an Untitled Document untouched when Save As is cancelled", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue(null);

    const saved = await document.save();

    expect(saved).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(document.canonicalPath).toBeNull();
    expect(document.dirty).toBe(true);
  });

  it("makes the Save As path canonical for subsequent Saves", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\old.md";
    document.mirrorContent("# v1");
    pickSavePathMock.mockResolvedValue("C:\\notes\\new.md");

    const savedAs = await document.saveAs();

    expect(savedAs).toBe(true);
    expect(document.canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.title).toBe("new.md — ALi-md-editor");

    document.mirrorContent("# v2");
    await document.save();

    expect(invokeMock).toHaveBeenLastCalledWith("save_document", {
      path: "C:\\notes\\new.md",
      content: "# v2",
    });
    expect(document.dirty).toBe(false);
  });

  it("keeps the Document Dirty and shows a toast when the write fails", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_document") {
        return Promise.reject("access denied");
      }
      return Promise.resolve(undefined);
    });
    const ui = useUiStore();

    const saved = await document.save();

    expect(saved).toBe(false);
    expect(document.dirty).toBe(true);
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(ui.toast).toContain("access denied");
  });

  it("remembers the directory of a successfully saved path", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue("C:\\notes\\drafts\\b.md");
    const ui = useUiStore();

    await document.saveAs();

    expect(ui.lastDirectory).toBe("C:/notes/drafts");
  });

  it("starts the Save As dialog at the current Document's directory", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue("C:\\notes\\b.md");

    await document.saveAs();

    expect(pickSavePathMock).toHaveBeenCalledWith({
      defaultPath: "C:\\notes\\a.md",
    });
  });
});
