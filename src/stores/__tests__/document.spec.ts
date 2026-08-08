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

vi.mock("../../lib/externalDialog", () => ({
  pickExternalModificationChoice: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../../lib/saveDialog";
import { pickExternalModificationChoice } from "../../lib/externalDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);
const pickExternalChoiceMock = vi.mocked(pickExternalModificationChoice);

describe("document store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    pickSavePathMock.mockReset();
    pickExternalChoiceMock.mockReset();
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
    expect(document.title).toBe("Untitled.md — Markdown-Magic");
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
    expect(document.title).toBe("Untitled.md * — Markdown-Magic");
    document.mirrorContent("");
    expect(document.title).toBe("Untitled.md — Markdown-Magic");
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
    expect(document.title).toBe("new.md — Markdown-Magic");

    document.mirrorContent("# v2");
    await document.save();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
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

  it("opens a file into the Document, updating the title and clearing Dirty", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\old.md";
    document.mirrorContent("# Old");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    const opened = await document.openDocument("C:\\notes\\new.md");

    expect(opened).toBe(true);
    expect(document.content).toBe("# New file");
    expect(document.canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.filename).toBe("new.md");
    expect(document.title).toBe("new.md — Markdown-Magic");
    expect(document.dirty).toBe(false);
  });

  it("remembers the directory of an opened path", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Hello");
      }
      return Promise.resolve(undefined);
    });
    const ui = useUiStore();

    await document.openDocument("C:\\notes\\drafts\\b.md");

    expect(ui.lastDirectory).toBe("C:/notes/drafts");
  });

  it("keeps the current Document and shows a toast when the read fails", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Safe");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.reject("not found");
      }
      return Promise.resolve(undefined);
    });
    const ui = useUiStore();

    const opened = await document.openDocument("C:\\notes\\missing.md");

    expect(opened).toBe(false);
    expect(document.content).toBe("# Safe");
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(ui.toast).toContain("not found");
  });

  it("scopes the asset protocol to the directory of an opened Document", async () => {
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# New file");
      }
      return Promise.resolve(undefined);
    });

    await document.openDocument("C:\\notes\\new.md");

    expect(invokeMock).toHaveBeenCalledWith("set_asset_root", {
      documentPath: "C:\\notes\\new.md",
    });
  });

  it("re-scopes the asset protocol after Save As changes the path", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue("C:\\notes\\drafts\\b.md");
    invokeMock.mockClear();

    await document.saveAs();

    expect(invokeMock).toHaveBeenCalledWith("set_asset_root", {
      documentPath: "C:\\notes\\drafts\\b.md",
    });
  });

  it("clears the asset scope for a fresh Untitled Document", () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    invokeMock.mockClear();

    document.newDocument();

    expect(invokeMock).toHaveBeenCalledWith("set_asset_root", {
      documentPath: null,
    });
  });

  it("creates a fresh Untitled Document, discarding the current one", () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");

    document.newDocument();

    expect(document.content).toBe("");
    expect(document.canonicalPath).toBeNull();
    expect(document.filename).toBe("Untitled.md");
    expect(document.dirty).toBe(false);
  });

  async function seedOpenedDocument(
    document: ReturnType<typeof useDocumentStore>,
  ) {
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# On disk");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# On disk", mtime_ms: 2 });
      }
      return Promise.resolve(undefined);
    });
    await document.openDocument("C:\\notes\\a.md");
  }

  it("does nothing for an Untitled Document on window focus", async () => {
    const document = useDocumentStore();

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "inspect_document",
      expect.anything(),
    );
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });

  it("silently reloads a clean Document whose file changed on disk", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(true);
    expect(document.content).toBe("# Changed");
    expect(document.dirty).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });

  it("does nothing when the file on disk matches the loaded version", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(document.content).toBe("# On disk");
    expect(document.dirty).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });

  it("keeps the Dirty Document untouched when the dialog is cancelled", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# My edits");
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    pickExternalChoiceMock.mockResolvedValue("cancel");

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
  });

  it("replaces the Dirty Document with the on-disk content when Reload is chosen", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# My edits");
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# External", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    pickExternalChoiceMock.mockResolvedValue("reload");

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(true);
    expect(document.content).toBe("# External");
    expect(document.dirty).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
  });

  it("writes the current content over the disk and stays Dirty when Overwrite is chosen", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# My edits");
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# External", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    pickExternalChoiceMock.mockResolvedValue("overwrite");

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# My edits",
    });
    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
  });

  it("does not re-detect the file after an Overwrite", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# My edits");
    pickExternalChoiceMock.mockResolvedValue("overwrite");
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# External", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    await document.checkExternalModification();
    pickExternalChoiceMock.mockClear();
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# My edits", mtime_ms: 4 });
      }
      return Promise.resolve(undefined);
    });

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });

  it("does not re-detect the file after a Save updates the baseline", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# v2");
    await document.save();
    pickExternalChoiceMock.mockClear();
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# v2", mtime_ms: 4 });
      }
      return Promise.resolve(undefined);
    });

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });

  it("ignores an unreadable file on window focus", async () => {
    const document = useDocumentStore();
    await seedOpenedDocument(document);
    document.mirrorContent("# My edits");
    invokeMock.mockImplementation((command: string) => {
      if (command === "inspect_document") {
        return Promise.reject("not found");
      }
      return Promise.resolve(undefined);
    });

    const replaced = await document.checkExternalModification();

    expect(replaced).toBe(false);
    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
  });
});
