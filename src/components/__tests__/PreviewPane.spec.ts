import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import PreviewPane from "../PreviewPane.vue";
import { useDocumentStore } from "../../stores/document";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import { openUrl } from "@tauri-apps/plugin-opener";

const openUrlMock = vi.mocked(openUrl);

function previewHtml(
  wrapper: ReturnType<typeof mount>,
): string {
  return wrapper.find(".preview-host").element.innerHTML;
}

function renderContent(text: string): Promise<void> {
  const document = useDocumentStore();
  document.mirrorContent(text);
  return nextTick().then(() => {
    vi.advanceTimersByTime(200);
  });
}

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

function stubSelection(anchorNode: Node, text: string) {
  vi.stubGlobal("getSelection", () => ({
    isCollapsed: false,
    anchorNode,
    focusNode: anchorNode,
    toString: () => text,
  }));
}

describe("PreviewPane", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    openUrlMock.mockReset();
    (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {
      convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
      invoke: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the current Document after the debounce window", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.mirrorContent("# Hello");
    await nextTick();

    expect(previewHtml(wrapper)).toBe("");

    vi.advanceTimersByTime(200);
    expect(previewHtml(wrapper)).toContain("<h1>Hello</h1>");
  });

  it("updates the Preview Pane live as the Document changes", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();

    document.mirrorContent("one");
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(previewHtml(wrapper)).toContain("<p>one</p>");

    document.mirrorContent("**two**");
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(previewHtml(wrapper)).toContain("<strong>two</strong>");
  });

  it("cancel-and-delays rapid typing so stale renders are never shown", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();

    document.mirrorContent("# a");
    await nextTick();
    vi.advanceTimersByTime(100);
    document.mirrorContent("# ab");
    await nextTick();
    vi.advanceTimersByTime(100);
    document.mirrorContent("# abc");
    await nextTick();
    expect(previewHtml(wrapper)).toBe("");

    vi.advanceTimersByTime(200);
    expect(previewHtml(wrapper)).toContain("<h1>abc</h1>");
    expect(previewHtml(wrapper)).not.toContain("<h1>a</h1>");
  });

  it("sanitizes the rendered output in the live preview", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();

    document.mirrorContent('<img src=x onerror="alert(1)">');
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(previewHtml(wrapper)).not.toContain("onerror");
  });

  it("renders each block with a data-block-index anchor", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();

    document.mirrorContent("# A\n\npara\n\n## B");
    await nextTick();
    vi.advanceTimersByTime(200);

    const blocks = wrapper.find(".preview-host").element.querySelectorAll(
      "[data-block-index]",
    );
    expect(blocks.length).toBe(3);
    expect(blocks[0].getAttribute("data-block-index")).toBe("0");
    expect(blocks[1].getAttribute("data-block-index")).toBe("1");
    expect(blocks[2].getAttribute("data-block-index")).toBe("2");
  });

  it("notifies onRender after the Preview Pane re-renders", async () => {
    const onRender = vi.fn();
    mount(PreviewPane, {
      props: { onRender },
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();

    document.mirrorContent("hi");
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("keeps a relative image src relative for an Untitled Document", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });

    await renderContent("![alt](pic.png)");
    const img = wrapper.find(".preview-host img");
    expect(img.attributes("src")).toBe("pic.png");
  });

  it("rewrites a relative image src against the Document's directory", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\note.md";

    await renderContent("![alt](pic.png)");
    const img = wrapper.find(".preview-host img");
    expect(img.attributes("src")).toBe(
      "asset://localhost/C%3A%5Cnotes%5Cpic.png",
    );
  });

  it("resolves a relative image in a subdirectory of the Document's directory", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\docs\\note.md";

    await renderContent("![alt](assets/pic.png)");
    const img = wrapper.find(".preview-host img");
    expect(img.attributes("src")).toBe(
      "asset://localhost/C%3A%5Cnotes%5Cdocs%5Cassets%5Cpic.png",
    );
  });

  it("leaves an external image URL untouched", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\note.md";

    await renderContent("![alt](https://example.com/pic.png)");
    const img = wrapper.find(".preview-host img");
    expect(img.attributes("src")).toBe("https://example.com/pic.png");
  });

  it("re-resolves images after the Document's path changes", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.canonicalPath = "C:\\notes\\note.md";
    await renderContent("![alt](pic.png)");
    expect(wrapper.find(".preview-host img").attributes("src")).toContain(
      "C%3A%5Cnotes",
    );

    document.canonicalPath = "D:\\other\\note.md";
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(wrapper.find(".preview-host img").attributes("src")).toContain(
      "D%3A%5Cother",
    );
  });

  it("opens a link in the system browser and prevents navigation", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("[docs](https://example.com/docs)");

    const link = wrapper.find(".preview-host a");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("does not open the link when a text selection covers it", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("[docs](https://example.com/docs)");

    const link = wrapper.find(".preview-host a").element as HTMLElement;
    const text = link.firstChild as Text;
    vi.stubGlobal("getSelection", () => ({
      isCollapsed: false,
      getRangeAt: () => ({
        startContainer: text,
        endContainer: text,
      }),
    }));

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(openUrlMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not open the link on a modifier-click", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("[docs](https://example.com/docs)");

    const link = wrapper.find(".preview-host a");
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    await link.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("collapses a Section from its chevron and records it on the Tab", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.mirrorContent("# A\n\ntext\n\n## B\n\nmore");
    await nextTick();
    vi.advanceTimersByTime(200);

    const chevron = wrapper.find(".md-chevron");
    expect(chevron.attributes("aria-expanded")).toBe("true");
    await chevron.trigger("click");

    const section = wrapper.find(".md-section");
    expect(section.classes()).toContain("md-section-collapsed");
    expect(chevron.attributes("aria-expanded")).toBe("false");
    expect(document.activeTab().collapsedSections).toEqual(["h1:A#1"]);
    // Collapsing marks the Section; CSS hides the body, never the heading.
    expect(section.find("h1").isVisible()).toBe(true);
  });

  it("expands a collapsed Section from its chevron", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.mirrorContent("# A\n\ntext");
    await nextTick();
    vi.advanceTimersByTime(200);

    await wrapper.find(".md-chevron").trigger("click");
    await wrapper.find(".md-chevron").trigger("click");

    expect(wrapper.find(".md-section").classes()).not.toContain("md-section-collapsed");
    expect(document.activeTab().collapsedSections).toEqual([]);
  });
  it("keeps a Section collapsed across re-renders as the Document changes", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.mirrorContent("# A\n\ntext\n\n## B\n\nmore");
    await nextTick();
    vi.advanceTimersByTime(200);

    await wrapper.find(".md-chevron").trigger("click");

    document.mirrorContent("# A\n\ntext edited\n\n## B\n\nmore");
    await nextTick();
    vi.advanceTimersByTime(200);

    const sections = wrapper.findAll(".md-section");
    expect(sections[0].classes()).toContain("md-section-collapsed");
    expect(sections[1].classes()).not.toContain("md-section-collapsed");
    expect(wrapper.find(".md-section-body").text()).toContain("text edited");
  });

  it("swaps collapsed Sections with the Active Tab", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const document = useDocumentStore();
    document.mirrorContent("# A\n\ntext");
    await nextTick();
    vi.advanceTimersByTime(200);
    await wrapper.find(".md-chevron").trigger("click");

    document.newTab();
    document.mirrorContent("## Other\n\nstuff");
    await nextTick();
    vi.advanceTimersByTime(200);

    const incoming = wrapper.find(".md-section");
    expect(incoming.classes()).not.toContain("md-section-collapsed");
    expect(incoming.attributes("data-section-key")).toBe("h2:Other#1");

    document.switchTab(0);
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(wrapper.find(".md-section").classes()).toContain("md-section-collapsed");
    expect(wrapper.find(".md-section").attributes("data-section-key")).toBe("h1:A#1");
  });
  it("leaves the preview text selectable", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const host = wrapper.find(".preview-host").element as HTMLElement;
    const style = globalThis.getComputedStyle(host);
    expect(style.userSelect).not.toBe("none");
  });

  it("copies selected text on mouse-up and shows the Copy Toast", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("Hello preview");

    const host = wrapper.find(".preview-host").element as HTMLElement;
    stubSelection(host.querySelector("p")!.firstChild!, "Hello preview");

    host.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, clientX: 40, clientY: 40 }),
    );
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("Hello preview");
    const toast = wrapper.find('[data-testid="copy-toast"]');
    expect(toast.text()).toContain("Copied to clipboard");
    // Anchored below-right of the cursor (40+12, 40+16).
    expect(toast.attributes("style")).toContain("left: 52px");
    expect(toast.attributes("style")).toContain("top: 56px");

    vi.advanceTimersByTime(1500);
    await nextTick();
    expect(wrapper.find('[data-testid="copy-toast"]').exists()).toBe(false);
  });

  it("does not copy a selection outside the Preview Pane", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("Hello preview");

    stubSelection(globalThis.document.body, "Hello preview");
    (wrapper.find(".preview-host").element as HTMLElement).dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="copy-toast"]').exists()).toBe(false);
  });

  it("copies a code block from its Code Copy Button", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("```js\nconst a = 1;\n```");

    const button = wrapper.find(".code-copy-btn");
    expect(button.exists()).toBe(true);
    await button.trigger("click", { clientX: 10, clientY: 10 });
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("const a = 1;");
    expect(wrapper.find('[data-testid="copy-toast"]').exists()).toBe(true);
  });

  it("copies only once across a double-click", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("Hello preview");

    const host = wrapper.find(".preview-host").element as HTMLElement;

    // Real double-click sequence: mouse-up (selection collapsed), mouse-up
    // (word selection applied), then dblclick. The copy must happen exactly
    // once — on the second mouse-up, nothing after it.
    vi.stubGlobal("getSelection", () => ({
      isCollapsed: true,
      anchorNode: null,
      toString: () => "",
    }));
    host.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    stubSelection(host.querySelector("p")!.firstChild!, "Hello preview");
    host.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("does not copy on a non-primary mouse-up", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("Hello preview");

    const host = wrapper.find(".preview-host").element as HTMLElement;
    stubSelection(host.querySelector("p")!.firstChild!, "Hello preview");

    host.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 2 }),
    );
    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="copy-toast"]').exists()).toBe(false);
  });

  it("anchors the Copy Toast at the button on keyboard activation", async () => {
    stubClipboard();
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    await renderContent("```js\nconst a = 1;\n```");

    const button = wrapper.find(".code-copy-btn");
    // Keyboard clicks carry no pointer position; with the button's rect away
    // from the origin, the toast must anchor there rather than at (0, 0).
    button.element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 20, height: 20 }) as DOMRect;
    button.element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    await vi.advanceTimersByTimeAsync(1);

    const toast = wrapper.find('[data-testid="copy-toast"]');
    expect(toast.exists()).toBe(true);
    expect(toast.attributes("style")).toContain("left: 112px");
  });
});
