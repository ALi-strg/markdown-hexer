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
});
