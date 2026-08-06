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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
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

vi.mock("../lib/externalDialog", () => ({
  pickExternalModificationChoice: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, type Event } from "@tauri-apps/api/event";
import { pickSavePath } from "../lib/saveDialog";
import { pickOpenPath } from "../lib/openDialog";
import { pickGuardChoice } from "../lib/guardDialog";
import { pickExternalModificationChoice } from "../lib/externalDialog";

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);
const pickSavePathMock = vi.mocked(pickSavePath);
const pickOpenPathMock = vi.mocked(pickOpenPath);
const pickGuardChoiceMock = vi.mocked(pickGuardChoice);
const pickExternalChoiceMock = vi.mocked(pickExternalModificationChoice);
const getCurrentWindowMock = vi.mocked(getCurrentWindow);

interface MockWindow {
  getCloseHandler: () => (event: { preventDefault: () => void }) => Promise<void>;
  getFocusHandler: () => (event: { payload: boolean }) => void;
  getDropHandler: () => (
    event: { payload: { type: string; paths?: string[] } },
  ) => void;
  getFileOpenHandler: () => (event: { payload: string }) => void;
  destroy: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  unlisten: ReturnType<typeof vi.fn>;
}

function mockWindow(): MockWindow {
  let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null =
    null;
  let focusHandler: ((event: { payload: boolean }) => void) | null = null;
  let dropHandler:
    | ((event: { payload: { type: string; paths?: string[] } }) => void)
    | null = null;
  let fileOpenHandler: ((event: { payload: string }) => void) | null = null;
  const destroy = vi.fn();
  const close = vi.fn();
  const unlisten = vi.fn();
  getCurrentWindowMock.mockReturnValue({
    onCloseRequested: vi.fn((handler: never) => {
      closeHandler = handler;
      return Promise.resolve(unlisten);
    }),
    onFocusChanged: vi.fn((handler: never) => {
      focusHandler = handler;
      return Promise.resolve(unlisten);
    }),
    onDragDropEvent: vi.fn((handler: never) => {
      dropHandler = handler;
      return Promise.resolve(unlisten);
    }),
    destroy,
    close,
  } as never);
  listenMock.mockImplementation(
    async (event: string, handler: (event: Event<unknown>) => void) => {
      if (event === "file-open-requested") {
        fileOpenHandler = handler as (event: { payload: string }) => void;
      }
      return unlisten;
    },
  );
  return {
    getCloseHandler: () =>
      closeHandler ?? (() => Promise.resolve()),
    getFocusHandler: () =>
      focusHandler ??
      (() => {
        // no-op
      }),
    getDropHandler: () =>
      dropHandler ??
      (() => {
        // no-op
      }),
    getFileOpenHandler: () =>
      fileOpenHandler ??
      (() => {
        // no-op
      }),
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
    pickExternalChoiceMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockReset();
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

  it("silently reloads a clean Document whose file changed on window focus", async () => {
    const window = mockWindow();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Original");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    await document.openDocument("C:\\notes\\a.md");
    expect(document.dirty).toBe(false);

    window.getFocusHandler()({ payload: true });
    await flushPromises();
    await nextTick();

    expect(document.content).toBe("# Changed");
    expect(document.dirty).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Changed");
  });

  it("keeps the Dirty Document when the Externally-Modified dialog is cancelled", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Original");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    await document.openDocument("C:\\notes\\a.md");
    document.mirrorContent("# My edits");
    pickExternalChoiceMock.mockResolvedValue("cancel");

    window.getFocusHandler()({ payload: true });
    await flushPromises();

    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
  });

  it("reloads a Dirty Document from disk when Reload is chosen on focus", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Original");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# External", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    await document.openDocument("C:\\notes\\a.md");
    document.mirrorContent("# My edits");
    pickExternalChoiceMock.mockResolvedValue("reload");

    window.getFocusHandler()({ payload: true });
    await flushPromises();

    expect(pickExternalChoiceMock).toHaveBeenCalledWith("a.md");
    expect(document.content).toBe("# External");
    expect(document.dirty).toBe(false);
  });

  it("overwrites the disk and stays Dirty when Overwrite is chosen on focus", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Original");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    await document.openDocument("C:\\notes\\a.md");
    document.mirrorContent("# My edits");
    pickExternalChoiceMock.mockResolvedValue("overwrite");

    window.getFocusHandler()({ payload: true });
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# My edits",
    });
    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
  });

  it("opens a dropped file into the Document in Preview Only", async () => {
    const window = mockWindow();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Dropped");
      }
      return Promise.resolve(undefined);
    });

    window.getDropHandler()({
      payload: { type: "drop", paths: ["C:\\notes\\d.md"] },
    });
    await flushPromises();

    expect(document.content).toBe("# Dropped");
    expect(document.canonicalPath).toBe("C:\\notes\\d.md");
    expect(document.filename).toBe("d.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("preview");
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Dropped");
  });

  it("ignores drag events that are not drops", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Dropped");
      }
      return Promise.resolve(undefined);
    });

    window.getDropHandler()({ payload: { type: "enter" } });
    window.getDropHandler()({ payload: { type: "over" } });
    window.getDropHandler()({ payload: { type: "leave" } });
    await flushPromises();

    expect(document.content).toBe("");
    expect(document.canonicalPath).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
  });

  it("keeps the Dirty Document when the Confirm-Discard Guard is cancelled on a drop", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# My edits");
    pickGuardChoiceMock.mockResolvedValue("cancel");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Dropped");
      }
      return Promise.resolve(undefined);
    });

    window.getDropHandler()({
      payload: { type: "drop", paths: ["C:\\notes\\d.md"] },
    });
    await flushPromises();

    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
    expect(document.canonicalPath).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
  });

  it("swaps a Dirty Document on a drop when the guard is dismissed", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# My edits");
    pickGuardChoiceMock.mockResolvedValue("dont-save");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Dropped");
      }
      return Promise.resolve(undefined);
    });

    window.getDropHandler()({
      payload: { type: "drop", paths: ["C:\\notes\\d.md"] },
    });
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalled();
    expect(document.content).toBe("# Dropped");
    expect(document.canonicalPath).toBe("C:\\notes\\d.md");
    expect(document.dirty).toBe(false);
  });

  it("opens a file the app was launched with through the Open flow", async () => {
    const wrapper = mount(App);
    const document = useDocumentStore();
    const ui = useUiStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_pending_file") {
        return Promise.resolve("C:\\notes\\start.md");
      }
      if (command === "open_document") {
        return Promise.resolve("# Launched");
      }
      return Promise.resolve(undefined);
    });
    await flushPromises();
    await nextTick();

    expect(document.content).toBe("# Launched");
    expect(document.canonicalPath).toBe("C:\\notes\\start.md");
    expect(document.filename).toBe("start.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("preview");
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Launched");
  });

  it("opens a file forwarded by a second instance in the existing window", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_pending_file") {
        return Promise.resolve(null);
      }
      if (command === "open_document") {
        return Promise.resolve("# Forwarded");
      }
      return Promise.resolve(undefined);
    });

    window.getFileOpenHandler()({ payload: "C:\\notes\\fwd.md" });
    await flushPromises();

    expect(document.content).toBe("# Forwarded");
    expect(document.canonicalPath).toBe("C:\\notes\\fwd.md");
    expect(document.dirty).toBe(false);
  });

  it("runs the Confirm-Discard Guard when a second instance opens onto a Dirty Document", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# My edits");
    pickGuardChoiceMock.mockResolvedValue("cancel");
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_pending_file") {
        return Promise.resolve(null);
      }
      if (command === "open_document") {
        return Promise.resolve("# Forwarded");
      }
      return Promise.resolve(undefined);
    });

    window.getFileOpenHandler()({ payload: "C:\\notes\\fwd.md" });
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalled();
    expect(document.content).toBe("# My edits");
    expect(document.dirty).toBe(true);
    expect(document.canonicalPath).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
  });
});
