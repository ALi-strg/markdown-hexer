import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import App from "../App.vue";
import { useUiStore } from "../stores/ui";
import { useDocumentStore } from "../stores/document";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../lib/saveDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);

describe("App shell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pickSavePathMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the workspace in Split View with both panes", () => {
    const wrapper = mount(App);
    expect(wrapper.find('[data-testid="editor-pane"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-pane"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "system",
    );
  });

  it("syncs the window title on mount", async () => {
    mount(App);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeMock).toHaveBeenCalledWith("set_document_title", {
      filename: "Untitled.md",
      dirty: false,
    });
  });

  it("shows both panes in Split View", () => {
    const wrapper = mount(App);
    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    const preview = wrapper.find('[data-testid="preview-pane"]')
      .element as HTMLElement;
    expect(editor.style.display).not.toBe("none");
    expect(preview.style.display).not.toBe("none");
  });

  it("hides the Editor Pane in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    const preview = wrapper.find('[data-testid="preview-pane"]')
      .element as HTMLElement;
    expect(editor.style.display).toBe("none");
    expect(preview.style.display).not.toBe("none");
  });

  it("hides the Preview Pane in Focus Mode", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    await nextTick();

    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    const preview = wrapper.find('[data-testid="preview-pane"]')
      .element as HTMLElement;
    expect(preview.style.display).toBe("none");
    expect(editor.style.display).not.toBe("none");
  });

  it("cycles layout mode on Cmd/Ctrl+Shift+P", async () => {
    mount(App);
    const ui = useUiStore();
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "P",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();
    expect(ui.layoutMode).toBe("preview");
  });

  it("writes an Untitled Document to a picked path on Cmd/Ctrl+S", async () => {
    mount(App);
    const document = useDocumentStore();
    invokeMock.mockClear();
    pickSavePathMock.mockResolvedValue("C:\\notes\\a.md");
    document.mirrorContent("# Hello");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(document.dirty).toBe(false);
  });

  it("runs Save As on Cmd/Ctrl+Shift+S and updates the window title", async () => {
    mount(App);
    const document = useDocumentStore();
    invokeMock.mockClear();
    document.canonicalPath = "C:\\notes\\old.md";
    document.mirrorContent("# v1");
    pickSavePathMock.mockResolvedValue("C:\\notes\\new.md");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\new.md",
      content: "# v1",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.filename).toBe("new.md");
  });

  it("shows an auto-dismissing toast when a save fails and keeps the Document Dirty", async () => {
    const wrapper = mount(App);
    const document = useDocumentStore();
    const ui = useUiStore();
    document.canonicalPath = "C:\\notes\\old.md";
    document.mirrorContent("# v1");
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_document") {
        return Promise.reject("disk full");
      }
      return Promise.resolve(undefined);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.dirty).toBe(true);
    expect(ui.toast).toContain("disk full");
    expect(wrapper.find('[data-testid="toast"]').exists()).toBe(true);
  });
  it("removes the toast element after it auto-dismisses", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.showToast("boom");
    await nextTick();
    expect(wrapper.find('[data-testid="toast"]').exists()).toBe(true);

    vi.runAllTimers();
    await nextTick();
    expect(wrapper.find('[data-testid="toast"]').exists()).toBe(false);
  });
});
