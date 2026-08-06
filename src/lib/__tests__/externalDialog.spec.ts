import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickExternalModificationChoice } from "../externalDialog";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("pickExternalModificationChoice", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows the native Externally-Modified dialog for the Document", async () => {
    invokeMock.mockResolvedValue("cancel");

    await pickExternalModificationChoice("notes.md");

    expect(invokeMock).toHaveBeenCalledWith("show_external_modified", {
      filename: "notes.md",
    });
  });

  it("returns the Reload choice", async () => {
    invokeMock.mockResolvedValue("reload");

    await expect(pickExternalModificationChoice("notes.md")).resolves.toBe(
      "reload",
    );
  });

  it("returns the Overwrite choice", async () => {
    invokeMock.mockResolvedValue("overwrite");

    await expect(pickExternalModificationChoice("notes.md")).resolves.toBe(
      "overwrite",
    );
  });

  it("returns the Cancel choice", async () => {
    invokeMock.mockResolvedValue("cancel");

    await expect(pickExternalModificationChoice("notes.md")).resolves.toBe(
      "cancel",
    );
  });

  it("treats an unexpected dialog result as Cancel", async () => {
    invokeMock.mockResolvedValue("yolo");

    await expect(pickExternalModificationChoice("notes.md")).resolves.toBe(
      "cancel",
    );
  });
});
