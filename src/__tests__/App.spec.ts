import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount, enableAutoUnmount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import App from "../App.vue";
import { useUiStore } from "../stores/ui";
import { useDocumentStore } from "../stores/document";
import { useSettingsStore } from "../stores/settings";

enableAutoUnmount(afterEach);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  convertFileSrc: vi.fn(
    (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  ),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
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
import { openUrl } from "@tauri-apps/plugin-opener";
import { pickSavePath } from "../lib/saveDialog";
import { pickOpenPath } from "../lib/openDialog";
import { pickGuardChoice } from "../lib/guardDialog";
import { pickExternalModificationChoice } from "../lib/externalDialog";

const invokeMock = vi.mocked(invoke);
const openUrlMock = vi.mocked(openUrl);
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
    localStorage.clear();
    setActivePinia(createPinia());
    pickSavePathMock.mockReset();
    pickOpenPathMock.mockReset();
    pickGuardChoiceMock.mockReset();
    pickExternalChoiceMock.mockReset();
    openUrlMock.mockReset();
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

  it("renders the formatting toolbar enabled in source-visible modes", () => {
    const wrapper = mount(App);
    const ids = [
      "toolbar-bold",
      "toolbar-italic",
      "toolbar-heading",
      "toolbar-list",
      "toolbar-link",
      "toolbar-code",
    ];
    for (const id of ids) {
      const button = wrapper.find(`[data-testid="${id}"]`);
      expect(button.exists()).toBe(true);
      expect((button.element as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("disables the formatting toolbar buttons in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const bold = wrapper.find('[data-testid="toolbar-bold"]');
    expect((bold.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies bold to the selection via the toolbar button", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });

    await wrapper.find('[data-testid="toolbar-bold"]').trigger("click");
    await nextTick();

    expect(document.content).toBe("**hello**");
  });

  it("applies italic to the selection via the Cmd/Ctrl+I shortcut", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", ctrlKey: true }),
    );
    await nextTick();

    expect(document.content).toBe("*hello*");
  });

  it("does not format via shortcut in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true }),
    );
    await nextTick();

    expect(document.content).toBe("hello");
  });

  it("opens the find overlay on Cmd/Ctrl+F", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    expect(ui.findOverlayOpen).toBe(true);
    expect(wrapper.find('[data-testid="find-panel"]').exists()).toBe(true);
  });

  it("keeps find available in Preview Only until a replace is attempted", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    expect(ui.layoutMode).toBe("preview");
    expect(wrapper.find('[data-testid="find-panel"]').exists()).toBe(true);
  });

  it("seeds the find query from the selection and navigates next/previous", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "alpha beta alpha" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    const input = wrapper.find('[data-testid="find-input"]');
    expect((input.element as HTMLInputElement).value).toBe("alpha");
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("1 / 2");

    await wrapper.find('[data-testid="find-next"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("2 / 2");

    await wrapper.find('[data-testid="find-prev"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("1 / 2");
  });

  it("lands on the first match when a query is typed into the find input", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "alpha beta alpha" } });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    await wrapper.find('[data-testid="find-input"]').setValue("alpha");
    await nextTick();

    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("1 / 2");
    const selection = view.state.selection.main;
    expect(view.state.sliceDoc(selection.from, selection.to)).toBe("alpha");
  });

  it("switches to Split View and replaces when replacing in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "alpha beta alpha" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });
    ui.cycleLayoutMode();
    await nextTick();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    await wrapper.find('[data-testid="replace-input"]').setValue("ALPHA");
    await wrapper.find('[data-testid="replace-next"]').trigger("click");
    await nextTick();

    expect(ui.layoutMode).toBe("split");
    expect(document.content).toBe("ALPHA beta alpha");
  });

  it("replaces in place in Split View without switching modes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "alpha beta alpha" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();

    await wrapper.find('[data-testid="replace-input"]').setValue("ALPHA");
    await wrapper.find('[data-testid="replace-all"]').trigger("click");
    await nextTick();

    expect(ui.layoutMode).toBe("split");
    expect(document.content).toBe("ALPHA beta ALPHA");
  });

  it("closes the find overlay via the close button", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    expect(ui.findOverlayOpen).toBe(true);

    await wrapper.find('[data-testid="find-close"]').trigger("click");
    await nextTick();

    expect(ui.findOverlayOpen).toBe(false);
    expect(wrapper.find('[data-testid="find-panel"]').exists()).toBe(false);
  });

  it("closes the find overlay when a new Document is created", async () => {
    mount(App);
    await flushPromises();
    const ui = useUiStore();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    expect(ui.findOverlayOpen).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    expect(ui.findOverlayOpen).toBe(false);
  });

  it("renders a relative image against the opened Document's directory", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("![pic](img.png)");
      }
      return Promise.resolve(undefined);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    vi.advanceTimersByTime(200);

    const img = wrapper.find('[data-testid="preview-pane"] img');
    expect(img.attributes("src")).toBe(
      "asset://localhost/C%3A%5Cnotes%5Cimg.png",
    );
  });

  it("opens a link clicked in the Preview Pane in the system browser", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "[docs](https://example.com)" } });
    await nextTick();
    vi.advanceTimersByTime(200);

    const link = wrapper.find('[data-testid="preview-pane"] a');
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("shows a theme control in the toolbar bound to the System default", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const select = wrapper.find(
      '[data-testid="toolbar-theme"]',
    ).element as HTMLSelectElement;
    expect(select.value).toBe("system");
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "system",
    );
  });

  it("switches the Theme from the toolbar and updates data-theme", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const settings = useSettingsStore();

    const select = wrapper.find('[data-testid="toolbar-theme"]');
    await select.setValue("dark");

    expect(settings.theme).toBe("dark");
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "dark",
    );
  });

  it("persists the chosen Theme so the next launch restores it", async () => {
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.find('[data-testid="toolbar-theme"]').setValue("light");
    expect(localStorage.getItem("alimd:settings")).toBe(
      JSON.stringify({ theme: "light" }),
    );
  });

  it("keeps the theme control usable in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const select = wrapper.find('[data-testid="toolbar-theme"]');
    expect((select.element as HTMLSelectElement).disabled).toBe(false);
    await select.setValue("dark");
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "dark",
    );
  });

  it("shows a font picker in the toolbar bound to the default", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const select = wrapper.find(
      '[data-testid="toolbar-font"]',
    ).element as HTMLSelectElement;
    expect(select.value).toBe("default");
    expect(
      wrapper.findAll('[data-testid="toolbar-font"] option'),
    ).toHaveLength(4);
    expect(wrapper.find('[data-testid="app"]').attributes("data-font")).toBe(
      "default",
    );
  });

  it("switches the font from the toolbar and updates data-font", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const settings = useSettingsStore();

    await wrapper.find('[data-testid="toolbar-font"]').setValue("serif");

    expect(settings.font).toBe("serif");
    expect(wrapper.find('[data-testid="app"]').attributes("data-font")).toBe(
      "serif",
    );
  });

  it("persists the chosen font so the next launch restores it", async () => {
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.find('[data-testid="toolbar-font"]').setValue("mono");

    expect(localStorage.getItem("alimd:settings")).toBe(
      JSON.stringify({ font: "mono" }),
    );
  });

  it("keeps the font picker usable in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const select = wrapper.find('[data-testid="toolbar-font"]');
    expect((select.element as HTMLSelectElement).disabled).toBe(false);
    await select.setValue("sans");
    expect(wrapper.find('[data-testid="app"]').attributes("data-font")).toBe(
      "sans",
    );
  });
});
