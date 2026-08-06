import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore } from "../../stores/document";
import { confirmDiscard } from "../confirmDiscard";
import { pickGuardChoice } from "../guardDialog";
import { pickSavePath } from "../saveDialog";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

vi.mock("../guardDialog", () => ({
  pickGuardChoice: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);
const pickGuardChoiceMock = vi.mocked(pickGuardChoice);

describe("confirmDiscard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    pickSavePathMock.mockReset();
    pickGuardChoiceMock.mockReset();
  });

  it("lets a clean Document proceed without showing the guard", async () => {
    const document = useDocumentStore();

    await expect(confirmDiscard(document)).resolves.toBe("discard");

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
  });

  it("saves a titled Dirty Document to its canonical path and returns save", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");

    await expect(confirmDiscard(document)).resolves.toBe("save");

    expect(pickGuardChoiceMock).toHaveBeenCalledWith("a.md");
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# Hello",
    });
    expect(document.dirty).toBe(false);
  });

  it("runs Save As for an Untitled Document and returns save", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue("C:\\notes\\new.md");

    await expect(confirmDiscard(document)).resolves.toBe("save");

    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\new.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.dirty).toBe(false);
  });

  it("returns discard without saving when Don't Save is chosen", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("dont-save");

    await expect(confirmDiscard(document)).resolves.toBe("discard");

    expect(pickSavePathMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("save_document", expect.anything());
    expect(document.dirty).toBe(true);
  });

  it("returns cancel and keeps the Document Dirty when Cancel is chosen", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("cancel");

    await expect(confirmDiscard(document)).resolves.toBe("cancel");

    expect(pickSavePathMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("save_document", expect.anything());
    expect(document.dirty).toBe(true);
  });

  it("returns cancel and stays Dirty when the Save write fails", async () => {
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_document") {
        return Promise.reject("disk full");
      }
      return Promise.resolve(undefined);
    });

    await expect(confirmDiscard(document)).resolves.toBe("cancel");

    expect(document.dirty).toBe(true);
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
  });

  it("returns cancel and stays Dirty when Save As is cancelled", async () => {
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue(null);

    await expect(confirmDiscard(document)).resolves.toBe("cancel");

    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("save_document", expect.anything());
    expect(document.dirty).toBe(true);
  });
});
