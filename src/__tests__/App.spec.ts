import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount, enableAutoUnmount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { undo as undoCommand, undoDepth } from "@codemirror/commands";
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

import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
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
    // The root always carries a resolved Palette, never "system"; jsdom has
    // no matchMedia, so System resolves to Light here.
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "light",
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

  it("adds a numbered Untitled Tab in Split View on Cmd/Ctrl+N, without the Guard", async () => {
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

    // The launch Tab now has a canonical path, so no Untitled Tab is open:
    // numbering restarts at Untitled.md (Q6-b).
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.canonicalPath).toBeNull();
    expect(document.filename).toBe("Untitled.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("split");
    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
  });

  it("adds an Untitled Tab on Cmd/Ctrl+N over a Dirty Document without the Guard", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();

    // The Dirty Document stays open in its own Tab; the new Tab is Active.
    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(document.filename).toBe("Untitled 2.md");
    expect(document.tabs[0].content).toBe("# Hello");
    expect(document.tabs[0].content).not.toBe(document.tabs[0].savedContent);
  });

  it("loads the new Untitled Tab's empty content into the Editor Pane on Cmd/Ctrl+N", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    expect(document.content).toBe("# Draft");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("");
    expect(document.tabs[0].content).toBe("# Draft");
  });

  it("creates a numbered Untitled Tab on Cmd/Ctrl+T, without the Guard", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    document.canonicalPath = "C:\\notes\\a.md";
    document.mirrorContent("# Hello");
    await document.save();
    expect(document.dirty).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(document.filename).toBe("Untitled.md");
    expect(ui.layoutMode).toBe("split");
  });

  it("closes the Active Tab on Cmd/Ctrl+W without the Guard when clean", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("Untitled.md");
  });

  it("runs the Confirm-Discard Guard for a Dirty Active Tab on Cmd/Ctrl+W", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("cancel");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledWith("b.md");
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[1].content).toBe("# B edits");
  });

  it("closes the window on Cmd/Ctrl+W when the last Tab is Active", async () => {
    const win = mockWindow();
    mount(App);
    await flushPromises();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "w", ctrlKey: true }),
    );
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalled();
  });

  it("cycles to the next Tab on Ctrl+Tab, swapping content and title", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    vi.advanceTimersByTime(200);
    // b.md is Active.
    expect(document.activeIndex).toBe(1);
    expect(document.filename).toBe("b.md");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }),
    );
    await nextTick();
    vi.advanceTimersByTime(200);

    // Forward cycles to the launch Tab: content, title, and editor swap.
    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("Untitled.md");
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Draft");
  });

  it("cycles to the previous Tab on Ctrl+Shift+Tab", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.switchTab(0);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await flushPromises();

    expect(document.activeIndex).toBe(1);
    expect(document.filename).toBe("b.md");
  });

  it("leaves a single Tab alone when Ctrl+Tab or Ctrl+Shift+Tab is pressed", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }),
    );
    await flushPromises();
    expect(document.activeIndex).toBe(0);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await flushPromises();
    expect(document.activeIndex).toBe(0);
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

  it("consumes the launch Tab when a file is opened on Cmd/Ctrl+O", async () => {
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
    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    // The opened file replaces the empty launch Tab in place.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("# Loaded");
    expect(document.canonicalPath).toBe("C:\\notes\\b.md");
    expect(document.filename).toBe("b.md");
    expect(document.dirty).toBe(false);
    expect(ui.layoutMode).toBe("preview");
  });

  it("opens onto a Dirty Document without running the Confirm-Discard Guard", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
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

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    // The Dirty Document is untouched in its own Tab.
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[0].content).toBe("# Hello");
    expect(document.tabs[0].content).not.toBe(document.tabs[0].savedContent);
    expect(document.content).toBe("# Loaded");
  });

  it("focuses the existing Tab when an already-open path is picked again", async () => {
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
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
    invokeMock.mockClear();
    document.mirrorContent("# Edited in b");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
    // The first open consumed the launch Tab, leaving the file as the only
    // Tab; re-opening the same path focuses it and adds no duplicate.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("# Edited in b");
  });

  it("shows a toast and adds no Tab when Open fails", async () => {
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

    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
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
    await document.openPathInTab("C:\\notes\\a.md");
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
    await document.openPathInTab("C:\\notes\\a.md");
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
    await document.openPathInTab("C:\\notes\\a.md");
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
    await document.openPathInTab("C:\\notes\\a.md");
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

  it("checks a background Tab for external changes only when it becomes Active", async () => {
    const win = mockWindow();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
      const path =
        typeof args === "object" && args !== null && "path" in args
          ? args.path
          : null;
      if (command === "open_document") {
        return Promise.resolve(`# ${path}`);
      }
      if (command === "inspect_document") {
        // a.md changed on disk; b.md still matches what was loaded.
        return Promise.resolve({
          content:
            path === "C:\\notes\\a.md" ? "# A changed" : "# C:\\notes\\b.md",
          mtime_ms: 3,
        });
      }
      return Promise.resolve(undefined);
    });
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // b.md is Active; a background a.md changed on disk. (The first open
    // consumed the empty launch Tab, so a.md sits at index 0.)
    expect(document.activeIndex).toBe(1);

    // Window focus checks only the Active Tab (b.md): the background a.md is
    // neither inspected nor reloaded.
    invokeMock.mockClear();
    win.getFocusHandler()({ payload: true });
    await flushPromises();
    expect(invokeMock).toHaveBeenCalledWith("inspect_document", {
      path: "C:\\notes\\b.md",
    });
    expect(invokeMock).not.toHaveBeenCalledWith("inspect_document", {
      path: "C:\\notes\\a.md",
    });
    expect(document.tabs[0].content).toBe("# C:\\notes\\a.md");

    // The moment a.md becomes Active it is checked, and its clean Document
    // reloads silently from disk.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await flushPromises();
    await nextTick();

    expect(invokeMock).toHaveBeenCalledWith("inspect_document", {
      path: "C:\\notes\\a.md",
    });
    expect(document.content).toBe("# A changed");
    expect(document.dirty).toBe(false);
    expect(pickExternalChoiceMock).not.toHaveBeenCalled();
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# A changed");
  });

  it("shows the Externally-Modified dialog when a Dirty Tab is activated", async () => {
    const wrapper = mount(App);
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
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // a.md is a background Dirty Tab: edited locally, changed on disk. (The
    // first open consumed the empty launch Tab, so a.md sits at index 0.)
    document.tabs[0].content = "# My edits";
    pickExternalChoiceMock.mockResolvedValue("reload");

    // Activating it checks it and, because it is Dirty, asks the user.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await flushPromises();
    await nextTick();

    expect(pickExternalChoiceMock).toHaveBeenCalledWith("a.md");
    expect(document.content).toBe("# External");
    expect(document.dirty).toBe(false);
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# External");
  });

  it("checks the background Tab that becomes Active when the Active Tab closes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
      const path =
        typeof args === "object" && args !== null && "path" in args
          ? args.path
          : null;
      if (command === "open_document") {
        return Promise.resolve(`# ${path}`);
      }
      if (command === "inspect_document") {
        // a.md changed on disk; b.md still matches what was loaded.
        return Promise.resolve({
          content:
            path === "C:\\notes\\a.md" ? "# A changed" : "# C:\\notes\\b.md",
          mtime_ms: 3,
        });
      }
      return Promise.resolve(undefined);
    });
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // b.md Active; closing it makes the background a.md Active, which is then
    // checked and reloads silently. (The first open consumed the empty launch
    // Tab, so the workspace is [a.md, b.md].)
    expect(document.activeIndex).toBe(1);
    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();
    await nextTick();

    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("a.md");
    expect(document.content).toBe("# A changed");
    expect(document.dirty).toBe(false);
  });

  it("checks an already-open Tab that is re-focused through Open", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
      const path =
        typeof args === "object" && args !== null && "path" in args
          ? args.path
          : null;
      if (command === "open_document") {
        return Promise.resolve(`# ${path}`);
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# Changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // Re-opening an already-open path focuses its background Tab — which
    // becomes Active, so it is checked and its clean Document reloads silently.
    // (The first open consumed the empty launch Tab, so a.md sits at index 0.)
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("# Changed");
    expect(document.dirty).toBe(false);
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Changed");
  });

  it("consumes the launch Tab when a file is dropped in Preview Only", async () => {
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

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    // The dropped file replaces the empty launch Tab in place.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
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

  it("opens a drop onto a Dirty Document without the Confirm-Discard Guard", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# My edits");
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

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    // The Dirty Document stays open in its own Tab.
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[0].content).toBe("# My edits");
    expect(document.tabs[0].content).not.toBe(document.tabs[0].savedContent);
    expect(document.content).toBe("# Dropped");
  });

  it("focuses the existing Tab when the same path is dropped again", async () => {
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
    window.getDropHandler()({
      payload: { type: "drop", paths: ["C:\\notes\\d.md"] },
    });
    await flushPromises();
    invokeMock.mockClear();
    document.mirrorContent("# Edited");
    document.switchTab(0);

    window.getDropHandler()({
      payload: { type: "drop", paths: ["C:\\notes\\d.md"] },
    });
    await flushPromises();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_document",
      expect.anything(),
    );
    // The first drop consumed the launch Tab; re-dropping the same path
    // focuses it and adds no duplicate.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("# Edited");
  });

  it("consumes the launch Tab when the app opens a file it was launched with", async () => {
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

    // The launched file replaces the empty launch Tab in place.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
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

  it("consumes the launch Tab when a second instance forwards a file", async () => {
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

    // The forwarded file replaces the empty launch Tab in place.
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.content).toBe("# Forwarded");
    expect(document.canonicalPath).toBe("C:\\notes\\fwd.md");
    expect(document.dirty).toBe(false);
  });

  it("opens a second-instance file onto a Dirty Document without the Guard", async () => {
    const window = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# My edits");
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

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[0].content).toBe("# My edits");
    expect(document.tabs[0].content).not.toBe(document.tabs[0].savedContent);
    expect(document.content).toBe("# Forwarded");
  });

  it("renders a Tab Bar above the toolbar with the Document's filename and a + affordance", async () => {
    const wrapper = mount(App);
    await flushPromises();

    const tabBar = wrapper.find('[data-testid="tab-bar"]');
    expect(tabBar.exists()).toBe(true);
    const tabs = wrapper.findAll('[data-testid="tab"]');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].text()).toContain("Untitled.md");
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="tab-dirty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tab-new"]').exists()).toBe(true);
    // The Tab Bar sits above the toolbar, at the very top of the window.
    const app = wrapper.find('[data-testid="app"]');
    expect(app.element.firstElementChild).toBe(tabBar.element);
  });

  it("shows the Tab Bar in every Layout Mode", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    const tabBar = () => wrapper.find('[data-testid="tab-bar"]');

    expect(tabBar().isVisible()).toBe(true);

    ui.cycleLayoutMode();
    await nextTick();
    expect(tabBar().isVisible()).toBe(true);

    ui.cycleLayoutMode();
    await nextTick();
    expect(tabBar().isVisible()).toBe(true);
  });

  it("marks a Dirty Document with an asterisk in its Tab", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();

    document.mirrorContent("# Hello");
    await nextTick();
    expect(wrapper.find('[data-testid="tab-dirty"]').exists()).toBe(true);

    document.mirrorContent("");
    await nextTick();
    expect(wrapper.find('[data-testid="tab-dirty"]').exists()).toBe(false);
  });

  it("adds a numbered Untitled Tab via the + affordance, making it Active", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();

    await wrapper.find('[data-testid="tab-new"]').trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.filename).toBe("Untitled 2.md");
    expect(ui.layoutMode).toBe("split");
    const tabs = wrapper.findAll('[data-testid="tab"]');
    expect(tabs[0].text()).toContain("Untitled.md");
    expect(tabs[1].text()).toContain("Untitled 2.md");
    expect(tabs[1].attributes("aria-selected")).toBe("true");
  });

  it("shows every open Tab's filename in the Tab Bar", async () => {
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
    pickOpenPathMock.mockResolvedValue("C:\\notes\\c.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    const tabs = wrapper.findAll('[data-testid="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toContain("b.md");
    expect(tabs[1].text()).toContain("c.md");
  });

  it("appends the parent folder when two open Documents share a basename", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# Same");
      }
      return Promise.resolve(undefined);
    });

    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    pickOpenPathMock.mockResolvedValue("C:\\docs\\a.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    expect(document.tabs).toHaveLength(2);
    const labels = wrapper.findAll('[data-testid="tab"]').map((tab) => tab.text());
    expect(labels[0]).toContain("a.md — notes");
    expect(labels[1]).toContain("a.md — docs");
  });

  it("activates a Tab on click, swapping the editor, preview, and window title", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    vi.advanceTimersByTime(200);
    invokeMock.mockClear();
    document.mirrorContent("# B edited");
    await nextTick();

    // b.md is Active and Dirty, so its Tab shows the asterisk.
    expect(document.activeIndex).toBe(1);
    expect(ui.layoutMode).toBe("preview");
    expect(
      wrapper
        .findAll('[data-testid="tab"]')[1]
        .find('[data-testid="tab-dirty"]')
        .exists(),
    ).toBe(true);

    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("Untitled.md");
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Draft");
    const preview = wrapper.find('[data-testid="preview-pane"] .preview-host');
    expect(preview.text()).not.toContain("B edited");
    expect(invokeMock).toHaveBeenCalledWith("set_document_title", {
      filename: "Untitled.md",
      dirty: true,
    });
  });

  it("switches the editor and preview to the clicked Tab's content", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    seedLaunchTab(wrapper);
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    vi.advanceTimersByTime(200);
    // Edit through the editor (the authoritative source) so the store mirror
    // and the preserved editor state stay in sync.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "# B edited" },
    });
    await nextTick();

    // Switch to the launch Tab and back; each switch re-renders that Tab's
    // content in the Editor and Preview Panes.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    vi.advanceTimersByTime(200);

    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# B edited");
    const preview = wrapper.find('[data-testid="preview-pane"] .preview-host');
    expect(preview.text()).toContain("B edited");
  });

  it("keeps each Tab's Layout Mode independent of the others", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // b.md opened in Preview Only.
    expect(ui.layoutMode).toBe("preview");

    // The Layout Switcher changes only the Active Document (b.md): the launch
    // Tab's record keeps its own mode.
    await wrapper.find('[data-testid="layout-split"]').trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
    expect(document.tabs[0].layoutMode).toBe("split");

    // Switching to the launch Tab shows its own mode; changing it there never
    // leaks into b.md (whose record keeps the Split set above).
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
    await wrapper.find('[data-testid="layout-focus"]').trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("focus");
    expect(document.tabs[1].layoutMode).toBe("split");

    // Back to b.md: the window renders b.md's Split mode, not the launch
    // Tab's Focus.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
  });

  it("cycles only the Active Document's mode on Cmd/Ctrl+Shift+P", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // b.md (Preview Only) cycles to Focus; the launch Tab's record is
    // untouched.
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "P",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();
    expect(ui.layoutMode).toBe("focus");
    expect(document.tabs[0].layoutMode).toBe("split");

    // The launch Tab's own cycle moves only its record: b.md's Focus survives.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("split");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "P",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await nextTick();
    expect(ui.layoutMode).toBe("preview");
    expect(document.tabs[1].layoutMode).toBe("focus");

    // Back to b.md: still Focus.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("focus");
  });

  it("renders the Active Tab's Layout Mode in the panes on switch", async () => {
    const wrapper = mount(App);
    await flushPromises();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    const preview = wrapper.find('[data-testid="preview-pane"]')
      .element as HTMLElement;

    // b.md opened in Preview Only: the Editor Pane is hidden.
    expect(editor.style.display).toBe("none");
    expect(preview.style.display).not.toBe("none");

    // The launch Tab is Split View: both panes are visible again.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    expect(editor.style.display).not.toBe("none");
    expect(preview.style.display).not.toBe("none");

    // Back to b.md: Preview Only hides the Editor Pane again.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    expect(editor.style.display).toBe("none");
    expect(preview.style.display).not.toBe("none");
  });

  it("keeps the divider position app-wide across Tabs", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.dividerPosition = 0.7;
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // The Split launch Tab renders the app-wide balance.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    const editor = wrapper.find('[data-testid="editor-pane"]')
      .element as HTMLElement;
    expect(editor.style.flexBasis).toBe("70%");

    // b.md (Preview Only) renders no basis; the stored position is unchanged.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    expect(ui.dividerPosition).toBe(0.7);

    // Back to the Split Tab: the same app-wide position applies.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    expect(editor.style.flexBasis).toBe("70%");
  });

  it("restores a Tab's cursor and undo history after a switch round trip", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });

    // Type into the launch Tab and move the cursor off the end of the insert.
    view.dispatch({ changes: { from: 0, insert: "# Draft\n\nBody" } });
    view.dispatch({ selection: { anchor: 8 } });
    await nextTick();
    expect(view.state.selection.main.head).toBe(8);

    // Open a second file, then click back to the launch Tab.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();

    // Cursor position and undo history survived the round trip.
    expect(view.state.doc.toString()).toBe("# Draft\n\nBody");
    expect(view.state.selection.main.head).toBe(8);
    expect(undoDepth(view.state)).toBe(1);

    // The preserved history is live: undoing reverts the insert.
    undoCommand(view);
    expect(view.state.doc.toString()).toBe("");
  });

  it("restores a Tab's scroll offset after a switch round trip", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });

    view.scrollDOM.scrollTop = 240;
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    // Back to the launch Tab: its captured offset is restored.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await nextTick();

    expect(view.scrollDOM.scrollTop).toBe(240);
  });

  it("defers a restored scroll offset until the pane becomes visible", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    const ui = useUiStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });

    view.scrollDOM.scrollTop = 240;
    // Open b.md (Preview Only) and return to the launch Tab: its restore runs
    // while the pane is still hidden by b.md's Preview Only, so the offset is
    // deferred, not dropped. The switch lands in the launch Tab's Split View,
    // which makes the pane visible and applies the deferred offset.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await nextTick();
    expect(view.scrollDOM.scrollTop).toBe(240);

    // A Preview-Only round trip keeps the offset: send the launch Tab to
    // Preview Only, leave and return while the pane is hidden, then bring it
    // back to Split View. (jsdom keeps the scroller's property even under
    // display:none, so zero it after the round trip, proving the deferred
    // apply — not the stale property — restores it.)
    ui.setLayoutMode("preview");
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await nextTick();
    view.scrollDOM.scrollTop = 0;
    ui.setLayoutMode("split");
    await nextTick();
    await nextTick();
    expect(view.scrollDOM.scrollTop).toBe(240);

    // The restored offset then survives the next switch away and back.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await nextTick();
    expect(view.scrollDOM.scrollTop).toBe(240);
  });

  it("starts an opened Tab with cleared undo history", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();

    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    await nextTick();
    expect(undoDepth(view.state)).toBe(1);

    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    // The opened file starts fresh: content loaded, no undo history, exactly
    // as today's destructive rebuild.
    expect(view.state.doc.toString()).toBe("# File B");
    expect(undoDepth(view.state)).toBe(0);
  });

  it("clears the preserved editor state when the Active Tab is externally reloaded", async () => {
    const mockWin = mockWindow();
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue("C:\\notes\\a.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# A content");
      }
      if (command === "inspect_document") {
        return Promise.resolve({ content: "# A changed", mtime_ms: 3 });
      }
      return Promise.resolve(undefined);
    });

    // Open a.md, edit it (building undo history), and round-trip through
    // another Tab so the editor state is preserved for it.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    view.dispatch({ changes: { from: 0, insert: "# A edited" } });
    await nextTick();
    expect(undoDepth(view.state)).toBe(1);
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();
    expect(undoDepth(view.state)).toBe(1);

    // The file changed on disk; Reload replaces the Document and the editor
    // rebuilds, so the undo history no longer reaches into the old content.
    pickExternalChoiceMock.mockResolvedValue("reload");
    mockWin.getFocusHandler()({ payload: true });
    await flushPromises();
    await nextTick();

    expect(view.state.doc.toString()).toBe("# A changed");
    expect(undoDepth(view.state)).toBe(0);
  });

  it("resolves relative images against the Active Document's directory after a switch", async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    seedLaunchTab(wrapper);
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("![pic](img.png)");
      }
      return Promise.resolve(undefined);
    });

    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(
      wrapper.find('[data-testid="preview-pane"] img').attributes("src"),
    ).toBe("asset://localhost/C%3A%5Cnotes%5Cimg.png");

    // Switching back to the pathless launch Tab stops image rewriting.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(wrapper.find('[data-testid="preview-pane"] img').exists()).toBe(false);
    expect(document.activeIndex).toBe(0);
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

  it("shows Theme, Font, and Text Size tooltips with their names only", () => {
    const wrapper = mount(App);
    expect(
      wrapper.find('[data-testid="toolbar-theme"]').attributes("title"),
    ).toBe("Theme");
    expect(
      wrapper.find('[data-testid="toolbar-font"]').attributes("title"),
    ).toBe("Font");
    expect(
      wrapper.find('[data-testid="toolbar-size"]').attributes("title"),
    ).toBe("Text Size");
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

  it("remembers each Tab's own Find query and current match across switches", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "alpha beta alpha" } });
    await nextTick();

    // Find "alpha" in the launch Tab and advance to the second match.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    await wrapper.find('[data-testid="find-input"]').setValue("alpha");
    await nextTick();
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("1 / 2");
    await wrapper.find('[data-testid="find-next"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("2 / 2");

    // A second file opens into its own Tab with its own (empty) Find state.
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    await nextTick();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    expect(
      (wrapper.find('[data-testid="find-input"]').element as HTMLInputElement)
        .value,
    ).toBe("");
    expect(wrapper.find('[data-testid="match-count"]').exists()).toBe(false);

    // Back to the launch Tab: its query and current match are restored — the
    // launch Tab's Find state was not clobbered by b.md's.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    expect(
      (wrapper.find('[data-testid="find-input"]').element as HTMLInputElement)
        .value,
    ).toBe("alpha");
    expect(wrapper.find('[data-testid="match-count"]').text()).toBe("2 / 2");
    // The panel's match count reads the restored current match (index 2 of 2),
    // so the remembered match — not just the query — came back.
    const restoredSelection = view.state.selection.main;
    expect(view.state.sliceDoc(restoredSelection.from, restoredSelection.to)).toBe(
      "alpha",
    );
  });

  it("switches only the Active Document to Split View when replacing in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    seedLaunchTab(wrapper);
    // The launch Tab keeps its own mode while a Preview-Only Tab replaces.
    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    await nextTick();
    expect(ui.layoutMode).toBe("focus");
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("alpha beta alpha");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();

    // b.md is Active in Preview Only.
    expect(ui.layoutMode).toBe("preview");
    expect(document.tabs[1].layoutMode).toBe("preview");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
    );
    await nextTick();
    await wrapper.find('[data-testid="find-input"]').setValue("alpha");
    await wrapper.find('[data-testid="replace-input"]').setValue("ALPHA");
    await wrapper.find('[data-testid="replace-next"]').trigger("click");
    await nextTick();

    // Only b.md switches to Split View; the launch Tab keeps its Focus mode.
    expect(document.tabs[1].layoutMode).toBe("split");
    expect(document.tabs[0].layoutMode).toBe("focus");
    expect(document.content).toBe("ALPHA beta alpha");

    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();
    expect(ui.layoutMode).toBe("focus");
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
    // The preference stays System while the root renders the resolved Palette
    // (Light in jsdom, which has no matchMedia).
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "light",
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

  it("offers all six Themes in the toolbar", async () => {
    const wrapper = mount(App);
    await flushPromises();
    expect(
      wrapper.findAll('[data-testid="toolbar-theme"] option'),
    ).toHaveLength(6);
  });

  it("switches to a Palette theme from the toolbar", async () => {
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.find('[data-testid="toolbar-theme"]').setValue("nord");
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "nord",
    );
  });

  it("persists the chosen Theme so the next launch restores it", async () => {
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.find('[data-testid="toolbar-theme"]').setValue("light");
    expect(localStorage.getItem("markdownhexer:settings")).toBe(
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

    expect(localStorage.getItem("markdownhexer:settings")).toBe(
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

  it("shows a text size picker in the toolbar bound to the default", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const select = wrapper.find(
      '[data-testid="toolbar-size"]',
    ).element as HTMLSelectElement;
    expect(select.value).toBe("medium");
    expect(
      wrapper.findAll('[data-testid="toolbar-size"] option'),
    ).toHaveLength(3);
    expect(wrapper.find('[data-testid="app"]').attributes("data-text-size")).toBe(
      "medium",
    );
  });

  it("switches the text size from the toolbar and updates data-text-size", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const settings = useSettingsStore();

    await wrapper.find('[data-testid="toolbar-size"]').setValue("large");

    expect(settings.textSize).toBe("large");
    expect(
      wrapper.find('[data-testid="app"]').attributes("data-text-size"),
    ).toBe("large");
  });

  it("persists the chosen text size so the next launch restores it", async () => {
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.find('[data-testid="toolbar-size"]').setValue("small");

    expect(localStorage.getItem("markdownhexer:settings")).toBe(
      JSON.stringify({ textSize: "small" }),
    );
  });

  it("keeps the text size picker usable in Preview Only", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();

    const select = wrapper.find('[data-testid="toolbar-size"]');
    expect((select.element as HTMLSelectElement).disabled).toBe(false);
    await select.setValue("large");
    expect(
      wrapper.find('[data-testid="app"]').attributes("data-text-size"),
    ).toBe("large");
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
      "toolbar-about",
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

  it("refuses Save As onto a path open in another Tab, showing a toast", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    // Return to the Untitled launch Tab before Save As.
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();

    pickSavePathMock.mockResolvedValue("C:\\notes\\b.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await flushPromises();

    expect(document.tabs[0].canonicalPath).toBeNull();
    expect(document.filename).toBe("Untitled.md");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
    expect(ui.toast).toContain("already open");
    expect(wrapper.find('[data-testid="toast"]').exists()).toBe(true);
  });

  it("saves the Active Tab to an unused path and updates its Tab label and title", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();

    pickSavePathMock.mockResolvedValue("C:\\notes\\free.md");
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\free.md",
      content: "# Draft",
    });
    expect(document.tabs[0].canonicalPath).toBe("C:\\notes\\free.md");
    expect(document.filename).toBe("free.md");
    expect(invokeMock).toHaveBeenCalledWith("set_document_title", {
      filename: "free.md",
      dirty: false,
    });
  });

  it("adds an Untitled Tab via the New button without the Confirm-Discard Guard", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    const ui = useUiStore();
    document.mirrorContent("# Hello");

    await wrapper.find('[data-testid="toolbar-new"]').trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.content).toBe("");
    expect(document.dirty).toBe(false);
    expect(document.filename).toBe("Untitled 2.md");
    expect(ui.layoutMode).toBe("split");
    expect(document.tabs[0].content).toBe("# Hello");
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

  it("renders the About button past the Layout Switcher with its tooltip", () => {
    const wrapper = mount(App);
    const about = wrapper.find('[data-testid="toolbar-about"]');
    expect(about.exists()).toBe(true);
    expect(about.attributes("title")).toBe("About (Ctrl/Cmd+/)");
    const layoutSwitcher = wrapper.find('[data-testid="layout-switcher"]')
      .element;
    expect(
      layoutSwitcher.compareDocumentPosition(about.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the About button visible in Split View and Focus Mode", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    expect(wrapper.find('[data-testid="toolbar-about"]').isVisible()).toBe(true);

    ui.cycleLayoutMode();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-about"]').isVisible()).toBe(true);
  });

  it("hides the About button in Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-about"]').isVisible()).toBe(false);
  });

  it("opens the About Dialog on the About button, showing version, repository link, and every shortcut grouped", async () => {
    const wrapper = mount(App);
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_version") {
        return Promise.resolve("1.2.3");
      }
      return Promise.resolve(undefined);
    });
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await flushPromises();

    const modal = wrapper.find('[data-testid="about-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.attributes("role")).toBe("dialog");
    expect(modal.text()).toContain("About Markdown Hexer");
    expect(modal.text()).toContain("Version 1.2.3");
    expect(
      wrapper.find('[data-testid="about-repo-link"]').attributes("href"),
    ).toBe("https://github.com/ALi-strg/markdown-hexer");

    const groupIds = [
      "shortcut-group-file",
      "shortcut-group-edit",
      "shortcut-group-format",
      "shortcut-group-view",
      "shortcut-group-tab",
      "shortcut-group-app",
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
      ["About", "Ctrl/Cmd+/"],
    ];
    const text = modal.text();
    for (const [label, combo] of expectations) {
      expect(text).toContain(label);
      expect(text).toContain(combo);
    }
  });

  it("lists the Tab shortcuts in the About Dialog", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await nextTick();

    const modal = wrapper.find('[data-testid="about-modal"]');
    expect(modal.exists()).toBe(true);
    expect(wrapper.find('[data-testid="shortcut-group-tab"]').exists()).toBe(
      true,
    );

    const text = modal.text();
    for (const [label, combo] of [
      ["New Tab", "Ctrl/Cmd+T"],
      ["Close Tab", "Ctrl/Cmd+W"],
      ["Next Tab", "Ctrl+Tab"],
      ["Previous Tab", "Ctrl+Shift+Tab"],
    ]) {
      expect(text).toContain(label);
      expect(text).toContain(combo);
    }
  });

  it("lists the reference entries within their category groups", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
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
      wrapper.find('[data-testid="shortcut-group-app"]').text(),
    ).toContain("Ctrl/Cmd+/");
  });

  it("toggles the About Dialog with Cmd/Ctrl+/", async () => {
    const wrapper = mount(App);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(false);
  });

  it("opens the About Dialog with Cmd/Ctrl+/ from Preview Only", async () => {
    const wrapper = mount(App);
    const ui = useUiStore();
    ui.cycleLayoutMode();
    await nextTick();
    expect(wrapper.find('[data-testid="toolbar-about"]').isVisible()).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", ctrlKey: true }),
    );
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(true);
  });

  it("closes the About Dialog with Escape", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(false);
  });

  it("closes the About Dialog when clicking outside the modal", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="about-overlay"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(false);
  });

  it("closes the About Dialog when the About button is pressed again", async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="about-modal"]').exists()).toBe(false);
  });

  it("never changes the Document or editor state when the About Dialog opens or closes", async () => {
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

    await wrapper.find('[data-testid="toolbar-about"]').trigger("click");
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

  /// Opens `path` into a new Tab via the Ctrl/Cmd+O shortcut. Shared by the
  /// close-control tests: the Guard's per-Tab Save needs a real second Tab to
  /// act on.
  /// Types a draft into the launch Tab so an Open does not consume it: a user
  /// who wrote into the launch Untitled Document keeps it when opening a file,
  /// producing the two-Tab [Untitled.md, file] workspace the tab-management
  /// tests assume. Dispatched through the editor so the store mirror and the
  /// preserved editor state stay in sync.
  function seedLaunchTab(wrapper: VueWrapper) {
    const pane = wrapper.findComponent({ ref: "editorPane" });
    const view = (pane.vm as unknown as { getView: () => EditorView }).getView();
    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
  }

  async function openSecondTab(wrapper: VueWrapper, path: string) {
    seedLaunchTab(wrapper);
    pickOpenPathMock.mockResolvedValue(path);
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve(`# ${path}`);
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    invokeMock.mockClear();
  }

  it("closes a clean Tab via its close control without the Guard", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("Untitled.md");
  });

  it("keeps a Dirty Tab open when its close Guard is cancelled", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("cancel");

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledWith("b.md");
    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.tabs[1].content).toBe("# B edits");
  });

  it("closes a Dirty Tab without writing when Don't Save is chosen", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("dont-save");

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_document",
      expect.anything(),
    );
  });

  it("saves a Dirty Tab and closes it when the close Guard chooses Save", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("save");

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledWith("b.md");
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\b.md",
      content: "# B edits",
    });
    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
  });

  it("activates the Tab to the right when the Active Tab closes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    seedLaunchTab(wrapper);
    pickOpenPathMock
      .mockResolvedValueOnce("C:\\notes\\b.md")
      .mockResolvedValueOnce("C:\\notes\\c.md");
    // Distinct contents per path, so the editor assertion below proves the
    // editor actually swapped to the right neighbor's Document.
    invokeMock.mockImplementation((command: string, args?: InvokeArgs) => {
      if (command === "open_document") {
        const isB =
          typeof args === "object" &&
          args !== null &&
          "path" in args &&
          args.path === "C:\\notes\\b.md";
        return Promise.resolve(isB ? "# B file" : "# C file");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    invokeMock.mockClear();
    // b.md Active; close it — c.md takes its place.
    await wrapper.findAll('[data-testid="tab"]')[1].trigger("click");
    await nextTick();

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await nextTick();

    expect(document.tabs).toHaveLength(2);
    expect(document.activeIndex).toBe(1);
    expect(document.filename).toBe("c.md");
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# C file");
  });

  it("activates the new last Tab when the last Tab closes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    document.switchTab(1);

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    expect(document.filename).toBe("Untitled.md");
  });

  it("closes the window when the last Tab closes", async () => {
    const window = mockWindow();
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.find('[data-testid="tab-close"]').trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
  });

  it("saves a Dirty last Tab via the Guard, then closes the window", async () => {
    const win = mockWindow();
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# launch edits");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue("C:\\notes\\launch.md");
    invokeMock.mockClear();

    await wrapper.find('[data-testid="tab-close"]').trigger("click");
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledWith("Untitled.md");
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\launch.md",
      content: "# launch edits",
    });
    // The Tab is not removed — the store keeps the last Tab — the window is.
    expect(document.tabs).toHaveLength(1);
    expect(win.destroy).toHaveBeenCalled();
  });

  it("closing a background Tab does not activate it", async () => {
    const wrapper = mount(App);
    await flushPromises();
    const document = useDocumentStore();
    await openSecondTab(wrapper, "C:\\notes\\b.md");
    await wrapper.findAll('[data-testid="tab"]')[0].trigger("click");
    await nextTick();

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(document.tabs).toHaveLength(1);
    expect(document.activeIndex).toBe(0);
    const editorContent = wrapper.find(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(editorContent.text()).toBe("# Draft");
  });

  it("runs the Guard once per Dirty Tab on window close, aborting when any cancels", async () => {
    const win = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# launch edits");
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    document.mirrorContent("# B edits");
    pickGuardChoiceMock
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("cancel");
    pickSavePathMock.mockResolvedValue("C:\\notes\\launch.md");
    invokeMock.mockClear();
    const event = { preventDefault: vi.fn() };

    await win.getCloseHandler()(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(pickGuardChoiceMock).toHaveBeenCalledTimes(2);
    expect(pickGuardChoiceMock).toHaveBeenNthCalledWith(1, "Untitled.md");
    expect(pickGuardChoiceMock).toHaveBeenNthCalledWith(2, "b.md");
    expect(win.destroy).not.toHaveBeenCalled();
    // The first Tab was saved before the second's Cancel aborted the close;
    // both stay open.
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\launch.md",
      content: "# launch edits",
    });
    expect(document.tabs).toHaveLength(2);
    expect(document.tabs[0].content).toBe(document.tabs[0].savedContent);
    expect(document.tabs[1].content).toBe("# B edits");
  });

  it("closes the window after saving every Dirty Tab when none cancels", async () => {
    const win = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    document.mirrorContent("# launch edits");
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("save");
    pickSavePathMock.mockResolvedValue("C:\\notes\\launch.md");
    invokeMock.mockClear();
    const event = { preventDefault: vi.fn() };

    await win.getCloseHandler()(event);
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledTimes(2);
    expect(win.destroy).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "C:\\notes\\b.md",
      content: "# B edits",
    });
  });

  it("prompts only for Dirty Tabs on window close", async () => {
    const win = mockWindow();
    mount(App);
    await flushPromises();
    const document = useDocumentStore();
    pickOpenPathMock.mockResolvedValue("C:\\notes\\b.md");
    invokeMock.mockImplementation((command: string) => {
      if (command === "open_document") {
        return Promise.resolve("# File B");
      }
      return Promise.resolve(undefined);
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "o", ctrlKey: true }),
    );
    await flushPromises();
    document.mirrorContent("# B edits");
    pickGuardChoiceMock.mockResolvedValue("save");
    const event = { preventDefault: vi.fn() };

    await win.getCloseHandler()(event);
    await flushPromises();

    expect(pickGuardChoiceMock).toHaveBeenCalledTimes(1);
    expect(pickGuardChoiceMock).toHaveBeenCalledWith("b.md");
    expect(win.destroy).toHaveBeenCalled();
  });
});
