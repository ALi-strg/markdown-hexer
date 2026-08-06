import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickSavePath } from "../saveDialog";
import { save } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

const saveMock = vi.mocked(save);

describe("pickSavePath", () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it("opens the native Save As dialog with the Markdown filters and default path", async () => {
    saveMock.mockResolvedValue("C:\\notes\\out.md");

    await pickSavePath({ defaultPath: "C:\\notes\\note.md" });

    expect(saveMock).toHaveBeenCalledWith({
      title: "Save As",
      defaultPath: "C:\\notes\\note.md",
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
  });

  it("returns the chosen path", async () => {
    saveMock.mockResolvedValue("C:\\notes\\out.md");

    await expect(pickSavePath()).resolves.toBe("C:\\notes\\out.md");
  });

  it("returns null when the dialog is cancelled", async () => {
    saveMock.mockResolvedValue(null);

    await expect(pickSavePath()).resolves.toBeNull();
  });
});
