import { describe, it, expect, vi, beforeEach } from "vitest";
import { printDocument, teardownPrintRender } from "../printExport";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

/// The module-level Print Render contract: an offscreen .md-content container
/// on <body>, chrome-free render output, and event-driven teardown. The user
/// flows (shortcut, toolbar) are covered by the App-level specs; these pin the
/// module's own seams.
describe("printExport", () => {
  beforeEach(() => {
    teardownPrintRender();
    document.body.innerHTML = "";
  });

  it("mounts one offscreen .md-content container on <body>", () => {
    printDocument("# Hello", null);
    const host = document.querySelector("body > .print-render");
    expect(host).not.toBeNull();
    expect(host?.classList.contains("md-content")).toBe(true);
  });

  it("renders with block wrapping off — no Sections, no preview chrome", () => {
    printDocument("# A\n\ntext\n\n# B\n\nmore", null);
    const host = document.querySelector(".print-render")!;
    expect(host.querySelector("h1")).not.toBeNull();
    expect(host.querySelector(".md-section")).toBeNull();
    expect(host.querySelector(".code-copy-btn")).toBeNull();
  });

  it("rewrites relative image srcs against the Document's directory", () => {
    printDocument("![alt](pic.png)", "C:\\notes\\a.md");
    const img = document.querySelector(".print-render img")!;
    expect(img.getAttribute("src")).toBe("asset://localhost/C:\\notes\\pic.png");
  });

  it("leaves image srcs alone for an Untitled Document", () => {
    printDocument("![alt](pic.png)", null);
    const img = document.querySelector(".print-render img")!;
    expect(img.getAttribute("src")).toBe("pic.png");
  });

  it("tears the container down on afterprint and forgets it", () => {
    printDocument("# Hello", null);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector(".print-render")).toBeNull();
    // A second print mounts a fresh container, not the removed one.
    printDocument("# Again", null);
    expect(document.querySelector(".print-render")?.textContent).toContain(
      "Again",
    );
  });

  it("keeps the container while the dialog is open on non-blocking engines", () => {
    printDocument("# Hello", null);
    // No afterprint yet (WebKit returns before the dialog closes) — the
    // container must still be there for the dialog to spool.
    expect(document.querySelector(".print-render")).not.toBeNull();
  });
});
