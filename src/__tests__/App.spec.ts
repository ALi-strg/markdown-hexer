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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("../lib/saveDialog", () => ({
  pickSavePath: vi.fn(),
}));

vi.mock("../lib/guardDialog", () => ({
  pickGuardChoice: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pickSavePath } from "../lib/saveDialog";
import { pickGuardChoice } from "../lib/guardDialog";

const invokeMock = vi.mocked(invoke);
const pickSavePathMock = vi.mocked(pickSavePath);
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
});
