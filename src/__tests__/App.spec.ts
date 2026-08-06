import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount, enableAutoUnmount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { EditorView } from "@codemirror/view";
import App from "../App.vue";
import { useUiStore } from "../stores/ui";
import { useDocumentStore } from "../stores/document";

enableAutoUnmount(afterEach);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("../lib/saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

vi.mock("../lib/openDialog", () => ({
  pickOpenPath: vi.fn(),
}));

vi.mock("../lib/guardDialog", () => ({
  pickGuardChoice: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pickSavePath } from "../lib/saveDialog";
import { pickOpenPath } from "../lib/openDialog";
import { pickGuardChoice } from "../lib/guardDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);
const pickOpenPathMock = vi.mocked(pickOpenPath);
const pickGuardChoiceMock = vi.mocked(pickGuardChoice);
const getCurrentWindowMock = vi.mocked(getCurrentWindow);

interface MockWindow {
  getCloseHandler: () => (event: { preventDefault: () => void }) => Promise<void>;
  destroy: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  unlisten: ReturnType<typeof vi.fn>;
}

function mockWindow(): MockWindow {
  let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null =
    null;
  const destroy = vi.fn();
  const close = vi.fn();
  const unlisten = vi.fn();
  getCurrentWindowMock.mockReturnValue({
    onCloseRequested: vi.fn((handler: never) => {
      closeHandler = handler;
      return Promise.resolve(unlisten);
    }),
    destroy,
    close,
  } as never);
  return {
    getCloseHandler: () =>
      closeHandler ?? (() => Promise.resolve()),
    destroy,
    close,
    unlisten,
  };
}

describe("App shell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pickSavePathMock.mockReset();
    pickOpenPathMock.mockReset();
    pickGuardChoiceMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    mockWindow();
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

  it("closes a clean Document without showing the Confirm-Discard Guard", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const event = { preventDefault: vi.fn() };

    await window.getCloseHandler()(event);
    await flushPromises();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
  });

  it("aborts the close and keeps the Document Dirty when the guard is cancelled", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("cancel");
    const event = { preventDefault: vi.fn() };

    await window.getCloseHandler()(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.destroy).not.toHaveBeenCalled();
    expect(document.dirty).toBe(true);
  });

  it("saves an Untitled Document and closes the window when Save is chosen", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue("C:\\notes\\a.md");
    invokeMock.mockClear();
    const event = { preventDefault: vi.fn() };

    await window.getCloseHandler()(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(document.dirty).toBe(false);
    expect(window.destroy).toHaveBeenCalled();
  });

  it("closes the window without writing when Don't Save is chosen", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("dont-save");
    invokeMock.mockClear();
    const event = { preventDefault: vi.fn() };

    await window.getCloseHandler()(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("save_document", expect.anything());
    expect(document.dirty).toBe(true);
  });

  it("creates an Untitled Document in Split View on Cmd/Ctrl+N", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    await document.save();
    expect(document.dirty).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.canonicalPath).toBeNull();
    expect(document.filename).toBe("Untitled.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("split");
    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
  });

  it("keeps the current Dirty Document when the guard is cancelled on Cmd/Ctrl+N", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("cancel");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.content).toBe("# Hello");
    expect(document.dirty).toBe(true);
    expect(document.canonicalPath).toBeNull();
  });

  it("discards a Dirty Document and creates an Untitled one in Split View on Cmd/Ctrl+N", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("dont-save");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(document.filename).toBe("Untitled.md");
    expect(ui.layoutMode).toBe("split");
  });

  it("clears the Editor Pane when Cmd/Ctrl+N swaps to a new Document", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    expect(document.content).toBe("# Draft");
    pickGuardChoiceMock.mockResolvedValue("dont-save");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("");
  });

  it("loads the opened file into the Editor Pane on Cmd/Ctrl+O", async () => {
    const wrapper = mount(App);
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Loaded");
      }
      return Promise.resolve(undefined);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Loaded");
  });

  it("opens a picked file into the Document in Preview Only on Cmd/Ctrl+O", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Loaded");
      }
      return Promise.resolve(undefined);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickOpenPathMock).toHaveBeenCalled();
    expect(document.content).toBe("# Loaded");
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.filename).toBe("b.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("preview");
  });

  it("aborts Open without showing the dialog when the guard is cancelled", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("cancel");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickOpenPathMock).not.toHaveBeenCalled();
    expect(document.content).toBe("# Hello");
    expect(document.dirty).toBe(true);
  });

  it("saves a Dirty Document before opening when the guard chooses Save", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue("C:\\notes\\saved.md");
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Loaded");
      }
      return Promise.resolve(undefined);
    });
    invokeMock.mockClear();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\saved.md",
      content: "# Hello",
    });
    expect(invokeMock).toHaveBeenCalledWith("open_document", {
      path: "C:\\notes\\b.md",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.dirty).toBe(false);
  });

  it("shows a toast and keeps the Document when Open fails", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\missing.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.reject("permission denied");
      }
      return Promise.resolve(undefined);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(ui.toast).toContain("permission denied");
  });
});
