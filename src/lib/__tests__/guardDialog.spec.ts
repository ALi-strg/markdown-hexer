import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickGuardChoice } from "../guardDialog";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("pickGuardChoice", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows the native Confirm-Discard dialog for the Document", async () => {
    invokeMock.mockResolvedValue("cancel");

    await pickGuardChoice("notes.md");

    expect(invokeMock).toHaveBeenCalledWith("show_confirm_discard", {
      filename: "notes.md",
    });
  });

  it("returns the Save choice", async () => {
    invokeMock.mockResolvedValue("save");

    await expect(pickGuardChoice("notes.md")).resolves.toBe("save");
  });

  it("returns the Don't Save choice", async () => {
    invokeMock.mockResolvedValue("dont-save");

    await expect(pickGuardChoice("notes.md")).resolves.toBe("dont-save");
  });

  it("returns the Cancel choice", async () => {
    invokeMock.mockResolvedValue("cancel");

    await expect(pickGuardChoice("notes.md")).resolves.toBe("cancel");
  });

  it("treats an unexpected dialog result as Cancel", async () => {
    invokeMock.mockResolvedValue("yolo");

    await expect(pickGuardChoice("notes.md")).resolves.toBe("cancel");
  });
});
