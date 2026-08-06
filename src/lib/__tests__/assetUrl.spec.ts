import { describe, it, expect, vi, afterEach } from "vitest";
import { isExternalSrc, resolveAssetSrc, toAssetUrl } from "../assetUrl";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

describe("isExternalSrc", () => {
  it("treats an empty src as external", () => {
    expect(isExternalSrc("")).toBe(true);
  });

  it("treats a scheme-bearing src as external", () => {
    expect(isExternalSrc("https://example.com/pic.png")).toBe(true);
    expect(isExternalSrc("data:image/png;base64,AA==")).toBe(true);
    expect(isExternalSrc("mailto:x@y.z")).toBe(true);
  });

  it("treats a root-relative src as external", () => {
    expect(isExternalSrc("/assets/pic.png")).toBe(true);
  });

  it("treats a protocol-relative src as external", () => {
    expect(isExternalSrc("//cdn.example.com/pic.png")).toBe(true);
  });

  it("treats a relative src as internal", () => {
    expect(isExternalSrc("pic.png")).toBe(false);
    expect(isExternalSrc("images/pic.png")).toBe(false);
    expect(isExternalSrc("../pic.png")).toBe(false);
  });
});

describe("resolveAssetSrc", () => {
  it("resolves a relative src against the Document's directory", () => {
    expect(resolveAssetSrc("pic.png", "C:\\notes")).toBe(
      "C:\\notes\\pic.png",
    );
  });

  it("resolves a nested relative src", () => {
    expect(resolveAssetSrc("images/pic.png", "C:\\notes\\docs")).toBe(
      "C:\\notes\\docs\\images\\pic.png",
    );
  });

  it("trims trailing separators from the base directory", () => {
    expect(resolveAssetSrc("pic.png", "C:\\notes\\")).toBe(
      "C:\\notes\\pic.png",
    );
  });

  it("resolves against a POSIX base directory", () => {
    expect(resolveAssetSrc("images/pic.png", "/home/me/notes")).toBe(
      "/home/me/notes/images/pic.png",
    );
  });

  it("returns null for an external src", () => {
    expect(resolveAssetSrc("https://example.com/pic.png", "C:\\notes")).toBeNull();
    expect(resolveAssetSrc("/pic.png", "C:\\notes")).toBeNull();
  });
});

describe("toAssetUrl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("converts an absolute path to an asset:// URL", () => {
    expect(toAssetUrl("C:\\notes\\pic.png")).toBe(
      "asset://localhost/C:\\notes\\pic.png",
    );
  });
});
