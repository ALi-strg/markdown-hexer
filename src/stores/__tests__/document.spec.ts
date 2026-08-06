import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore } from "../document";

describe("document store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
});
