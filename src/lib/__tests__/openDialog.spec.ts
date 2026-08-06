import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickOpenPath } from "../openDialog";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const openMock = vi.mocked(open);

describe("pickOpenPath", () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  it("opens the native Open dialog with the Markdown family plus All files", async () => {
    openMock.mockResolvedValue("C:\\notes\\a.md");

    await pickOpenPath({ defaultPath: "C:\\notes" });

    expect(openMock).toHaveBeenCalledWith({
      title: "Open",
      defaultPath: "C:\\notes",
      multiple: false,
      directory: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
  });

  it("returns the chosen path", async () => {
    openMock.mockResolvedValue("C:\\notes\\a.md");

    await expect(pickOpenPath()).resolves.toBe("C:\\notes\\a.md");
  });

  it("returns null when the dialog is cancelled", async () => {
    openMock.mockResolvedValue(null);

    await expect(pickOpenPath()).resolves.toBeNull();
  });
});
