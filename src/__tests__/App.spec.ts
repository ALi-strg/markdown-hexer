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

/// The Document Controls' data-testid ids, reused across the render, visibility,
/// and Preview-cleanliness assertions.
const DOCUMENT_CONTROL_IDS = [
  "toolbar-new",
  "toolbar-open",
  "toolbar-save",
  "toolbar-save-as",
  "toolbar-find",
] as const;

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

  it("renders the Layout Switcher with Split, Preview, and Focus segments", () => {
    const wrapper = mount(App);
    for (const id of ["layout-split", "layout-preview", "layout-focus"]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }
    expect(
      wrapper.find('[data-testid="layout-split"]').attributes("aria-pressed"),
    ).toBe("true");
  });

  it("switches Layout Mode when a Layout Switcher segment is clicked", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();

    await wrapper.find('[data-testid="layout-preview"]').trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("preview");

    await wrapper.find('[data-testid="layout-focus"]').trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("focus");

    await wrapper.find('[data-testid="layout-split"]').trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
  });

  it("reflects the current Layout Mode as the active segment", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(
      wrapper.find('[data-testid="layout-preview"]').attributes("aria-pressed"),
    ).toBe("true");
  });

  it("keeps the Layout Switcher usable in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const split = wrapper.find('[data-testid="layout-split"]');
    expect((split.element as HTMLButtonElement).disabled).toBe(false);
    await split.trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
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

  it("hides the formatting toolbar in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const bold = wrapper.find('[data-testid="toolbar-bold"]');
    expect(bold.isVisible()).toBe(false);
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

  it("shows every formatting shortcut in its toolbar tooltip", () => {
    const wrapper = mount(App);
    const expectations: Array<[string, string]> = [
      ["toolbar-bold", "Bold (Ctrl/Cmd+B)"],
      ["toolbar-italic", "Italic (Ctrl/Cmd+I)"],
      ["toolbar-heading", "Heading (Ctrl/Cmd+Shift+H)"],
      ["toolbar-list", "List (Ctrl/Cmd+Shift+L)"],
      ["toolbar-link", "Link (Ctrl/Cmd+K)"],
      ["toolbar-code", "Code (Ctrl/Cmd+Shift+C)"],
    ];
    for (const [id, title] of expectations) {
      expect(wrapper.find(`[data-testid="${id}"]`).attributes("title")).toBe(
        title,
      );
    }
  });

  it("shows Theme and Font tooltips with their names only", () => {
    const wrapper = mount(App);
    expect(
      wrapper.find('[data-testid="toolbar-theme"]').attributes("title"),
    ).toBe("Theme");
    expect(
      wrapper.find('[data-testid="toolbar-font"]').attributes("title"),
    ).toBe("Font");
  });

  it("shows the cycle-layout shortcut in every Layout Switcher tooltip", () => {
    const wrapper = mount(App);
    const expectations: Array<[string, string]> = [
      ["layout-split", "Switch to Split (Ctrl/Cmd+Shift+P)"],
      ["layout-preview", "Switch to Preview (Ctrl/Cmd+Shift+P)"],
      ["layout-focus", "Switch to Focus (Ctrl/Cmd+Shift+P)"],
    ];
    for (const [id, title] of expectations) {
      expect(wrapper.find(`[data-testid="${id}"]`).attributes("title")).toBe(
        title,
      );
    }
  });

  it("applies heading to the selection via the Cmd/Ctrl+Shift+H shortcut", async () => {
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
      new KeyboardEvent("keydown", {
        key: "H",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();

    expect(document.content).toBe("# hello");
  });

  it("applies list to the selection via the Cmd/Ctrl+Shift+L shortcut", async () => {
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
      new KeyboardEvent("keydown", {
        key: "L",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();

    expect(document.content).toBe("- hello");
  });

  it("applies link to the selection via the Cmd/Ctrl+K shortcut", async () => {
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
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
    );
    await nextTick();

    expect(document.content).toBe("[hello](url)");
  });

  it("applies code to the selection via the Cmd/Ctrl+Shift+C shortcut", async () => {
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
      new KeyboardEvent("keydown", {
        key: "C",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();

    expect(document.content).toBe("`hello`");
  });

  it("does not format via the new shortcuts in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    view.dispatch({
      selection: { anchor: 0, head: 5 },
      annotations: Transaction.addToHistory.of(false),
    });

    for (const event of [
      new KeyboardEvent("keydown", {
        key: "H",
        ctrlKey: true,
        shiftKey: true,
      }),
      new KeyboardEvent("keydown", {
        key: "L",
        ctrlKey: true,
        shiftKey: true,
      }),
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      new KeyboardEvent("keydown", {
        key: "C",
        ctrlKey: true,
        shiftKey: true,
      }),
    ]) {
      window.dispatchEvent(event);
    }
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

  it("drags the divider to rebalance the panes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    const workspace = wrapper.find(".workspace").element;
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      width: 1000,
    } as DOMRect);
    const divider = wrapper.find('[data-testid="divider"]').element;

    divider.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 500,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 700,
        pointerId: 1,
        bubbles: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
    );
    await nextTick();

    expect(ui.dividerPosition).toBeCloseTo(0.7, 5);
    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    expect(editor.style.flexBasis).toBe("70%");
  });

  it("shows a draggable divider in Split View", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const divider = wrapper.find('[data-testid="divider"]');
    expect(divider.exists()).toBe(true);
    expect(divider.attributes("role")).toBe("separator");
  });

  it("hides the divider outside Split View", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="divider"]').exists()).toBe(false);
  });

  it("sizes the panes from the divider position", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.dividerPosition = 0.7;
    await nextTick();

    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    const preview = wrapper.find('[data-testid="preview-pane"]')
      .element as HTMLElement;
    expect(editor.style.flexBasis).toBe("70%");
    expect(preview.style.flexBasis).toBe("30%");
  });

  it("keeps the divider position when cycling away from and back to Split View", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    const workspace = wrapper.find(".workspace").element;
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      width: 1000,
    } as DOMRect);
    const divider = wrapper.find('[data-testid="divider"]').element;
    divider.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 500,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 700,
        pointerId: 1,
        bubbles: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
    );
    await nextTick();
    expect(ui.dividerPosition).toBeCloseTo(0.7, 5);

    ui.cycleLayoutMode();
    await nextTick();
    ui.cycleLayoutMode();
    await nextTick();
    ui.cycleLayoutMode();
    await nextTick();

    expect(ui.layoutMode).toBe("split");
    expect(ui.dividerPosition).toBeCloseTo(0.7, 5);
    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    expect(editor.style.flexBasis).toBe("70%");
  });

  it("clamps the divider position so both panes stay usable", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    const workspace = wrapper.find(".workspace").element;
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      width: 1000,
    } as DOMRect);
    const divider = wrapper.find('[data-testid="divider"]').element;
    divider.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 500,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 2000,
        pointerId: 1,
        bubbles: true,
      }),
    );
    divider.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
    );
    await nextTick();

    expect(ui.dividerPosition).toBe(0.85);
  });

  it("renders the Document Controls at the left end with shortcut tooltips", () => {
    const wrapper = mount(App);
    const expectations: Array<[string, string]> = [
      ["toolbar-new", "New (Ctrl/Cmd+N)"],
      ["toolbar-open", "Open (Ctrl/Cmd+O)"],
      ["toolbar-save", "Save (Ctrl/Cmd+S)"],
      ["toolbar-save-as", "Save As (Ctrl/Cmd+Shift+S)"],
      ["toolbar-find", "Find & Replace (Ctrl/Cmd+F)"],
    ];
    for (const [id, title] of expectations) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="${id}"]`).attributes("title")).toBe(
        title,
      );
    }
  });

  it("hides the Document Controls in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    for (const id of DOCUMENT_CONTROL_IDS) {
      expect(wrapper.find(`[data-testid="${id}"]`).isVisible()).toBe(false);
    }
  });

  it("keeps the Document Controls visible in Focus Mode", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    await nextTick();

    for (const id of DOCUMENT_CONTROL_IDS) {
      expect(wrapper.find(`[data-testid="${id}"]`).isVisible()).toBe(true);
    }
  });

  it("keeps the Preview Only toolbar to Theme, Font, and the Layout Switcher", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    expect(wrapper.find('[data-testid="toolbar-theme"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-testid="toolbar-font"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-testid="layout-switcher"]').isVisible()).toBe(
      true,
    );
    for (const id of [
      ...DOCUMENT_CONTROL_IDS,
      "toolbar-undo",
      "toolbar-redo",
      "toolbar-bold",
      "toolbar-help",
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).isVisible()).toBe(false);
    }
  });

  it("saves an Untitled Document through the Save button as Save As", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    pickSavePathMock.mockResolvedValue("C:\\notes\\a.md");
    invokeMock.mockClear();

    await wrapper.find('[data-testid="toolbar-save"]').trigger("click");
    await flushPromises();

    expect(pickSavePathMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\a.md",
      content: "# Hello",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\a.md");
    expect(document.dirty).toBe(false);
  });

  it("writes the Document to a new path through the Save As button", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\old.md";
    document.mirrorContent("# v1");
    pickSavePathMock.mockResolvedValue("C:\\notes\\new.md");
    invokeMock.mockClear();

    await wrapper.find('[data-testid="toolbar-save-as"]').trigger("click");
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\new.md",
      content: "# v1",
    });
    expect(document.canonicalPath).toBe("C:\\notes\\new.md");
    expect(document.filename).toBe("new.md");
  });

  it("runs the Confirm-Discard Guard and creates a new Document via the New button", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    document.mirrorContent("# Hello");
    pickGuardChoiceMock.mockResolvedValue("dont-save");

    await wrapper.find('[data-testid="toolbar-new"]').trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalled();
    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(document.filename).toBe("Untitled.md");
    expect(ui.layoutMode).toBe("split");
  });

  it("opens a picked file through the Open button, landing in Preview Only", async () => {
    const wrapper = mount(App);
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

    await wrapper.find('[data-testid="toolbar-open"]').trigger("click");
    await flushPromises();

    expect(pickOpenPathMock).toHaveBeenCalled();
    expect(document.content).toBe("# Loaded");
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.filename).toBe("b.md");
    expect(ui.layoutMode).toBe("preview");
  });

  it("opens the Find & Replace panel via its toolbar button", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();

    await wrapper.find('[data-testid="toolbar-find"]').trigger("click");
    await nextTick();

    expect(ui.findOverlayOpen).toBe(true);
    expect(wrapper.find('[data-testid="find-panel"]').exists()).toBe(true);
  });

  it("renders Undo and Redo beside the Formatting Buttons with shortcut tooltips", () => {
    const wrapper = mount(App);
    expect(wrapper.find('[data-testid="toolbar-undo"]').attributes("title")).toBe(
      "Undo (Ctrl/Cmd+Z)",
    );
    expect(wrapper.find('[data-testid="toolbar-redo"]').attributes("title")).toBe(
      "Redo (Ctrl/Cmd+Shift+Z)",
    );
  });

  it("hides Undo and Redo in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    expect(wrapper.find('[data-testid="toolbar-undo"]').isVisible()).toBe(false);
    expect(wrapper.find('[data-testid="toolbar-redo"]').isVisible()).toBe(false);
  });

  it("starts with Undo and Redo disabled and enables Undo after an edit", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const undo = wrapper.find('[data-testid="toolbar-undo"]');
    const redo = wrapper.find('[data-testid="toolbar-redo"]');
    expect((undo.element as HTMLButtonElement).disabled).toBe(true);
    expect((redo.element as HTMLButtonElement).disabled).toBe(true);

    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    await nextTick();

    expect((undo.element as HTMLButtonElement).disabled).toBe(false);
    expect((redo.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("undoes and redoes through the toolbar buttons", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    await nextTick();

    await wrapper.find('[data-testid="toolbar-undo"]').trigger("click");
    await nextTick();
    expect(document.content).toBe("");
    expect(
      (wrapper.find('[data-testid="toolbar-undo"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (wrapper.find('[data-testid="toolbar-redo"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    await wrapper.find('[data-testid="toolbar-redo"]').trigger("click");
    await nextTick();
    expect(document.content).toBe("hello");
  });

  it("renders the Help button past the Layout Switcher with its tooltip", () => {
    const wrapper = mount(App);
    const help = wrapper.find('[data-testid="toolbar-help"]');
    expect(help.exists()).toBe(true);
    expect(help.attributes("title")).toBe("Help (Ctrl/Cmd+/)");
    const layoutSwitcher = wrapper.find('[data-testid="layout-switcher"]')
      .element;
    expect(
      layoutSwitcher.compareDocumentPosition(help.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the Help button visible in Split View and Focus Mode", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    expect(wrapper.find('[data-testid="toolbar-help"]').isVisible()).toBe(true);

    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-help"]').isVisible()).toBe(true);
  });

  it("hides the Help button in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-help"]').isVisible()).toBe(false);
  });

  it("opens the Shortcuts Reference on the Help button and lists every shortcut grouped", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();

    const modal = wrapper.find('[data-testid="shortcuts-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.attributes("role")).toBe("dialog");
    expect(modal.text()).toContain("Shortcuts Reference");

    const groupIds = [
      "shortcut-group-file",
      "shortcut-group-edit",
      "shortcut-group-format",
      "shortcut-group-view",
      "shortcut-group-help",
    ];
    for (const id of groupIds) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }

    const expectations: Array<[string, string]> = [
      ["New", "Ctrl/Cmd+N"],
      ["Open", "Ctrl/Cmd+O"],
      ["Save", "Ctrl/Cmd+S"],
      ["Save As", "Ctrl/Cmd+Shift+S"],
      ["Undo", "Ctrl/Cmd+Z"],
      ["Redo", "Ctrl/Cmd+Shift+Z"],
      ["Find & Replace", "Ctrl/Cmd+F"],
      ["Bold", "Ctrl/Cmd+B"],
      ["Italic", "Ctrl/Cmd+I"],
      ["Heading", "Ctrl/Cmd+Shift+H"],
      ["List", "Ctrl/Cmd+Shift+L"],
      ["Link", "Ctrl/Cmd+K"],
      ["Code", "Ctrl/Cmd+Shift+C"],
      ["Cycle layout", "Ctrl/Cmd+Shift+P"],
      ["Help", "Ctrl/Cmd+/"],
    ];
    const text = modal.text();
    for (const [label, combo] of expectations) {
      expect(text).toContain(label);
      expect(text).toContain(combo);
    }
  });

  it("lists the reference entries within their category groups", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();

    expect(
      wrapper.find('[data-testid="shortcut-group-file"]').text(),
    ).toContain("Save As");
    expect(wrapper.find('[data-testid="shortcut-group-edit"]').text()).toContain(
      "Find & Replace",
    );
    expect(
      wrapper.find('[data-testid="shortcut-group-format"]').text(),
    ).toContain("Heading");
    expect(
      wrapper.find('[data-testid="shortcut-group-view"]').text(),
    ).toContain("Cycle layout");
    expect(
      wrapper.find('[data-testid="shortcut-group-help"]').text(),
    ).toContain("Ctrl/Cmd+/");
  });

  it("toggles the Shortcuts Reference with Cmd/Ctrl+/", async () => {
    const wrapper = mount(App);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(false);
  });

  it("opens the Shortcuts Reference with Cmd/Ctrl+/ from Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-help"]').isVisible()).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(true);
  });

  it("closes the Shortcuts Reference with Escape", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(false);
  });

  it("closes the Shortcuts Reference when clicking outside the modal", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="shortcuts-overlay"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(false);
  });

  it("closes the Shortcuts Reference when the Help button is pressed again", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="shortcuts-modal"]').exists()).toBe(false);
  });

  it("never changes the Document or editor state when the Shortcuts Reference opens or closes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    await nextTick();
    const contentBefore = document.content;
    const undoDisabledBefore = (
      wrapper.find('[data-testid="toolbar-undo"]').element as HTMLButtonElement
    ).disabled;

    await wrapper.find('[data-testid="toolbar-help"]').trigger("click");
    await nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();

    expect(document.content).toBe(contentBefore);
    expect(document.dirty).toBe(true);
    expect(
      (wrapper.find('[data-testid="toolbar-undo"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(undoDisabledBefore);
  });

  it("clears undo history when a new Document replaces the editor content", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    await nextTick();

    const undo = wrapper.find('[data-testid="toolbar-undo"]');
    expect((undo.element as HTMLButtonElement).disabled).toBe(false);

    document.mirrorContent("");
    (pane.vm as unknown as { replaceContent: (text: string) => void }).replaceContent(
      "",
    );
    await nextTick();

    expect((undo.element as HTMLButtonElement).disabled).toBe(true);
    expect(
      (wrapper.find('[data-testid="toolbar-redo"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
