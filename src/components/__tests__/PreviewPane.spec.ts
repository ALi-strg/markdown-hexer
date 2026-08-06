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

describe("PreviewPane", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    openUrlMock.mockReset();
    (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {
      convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("leaves the preview text selectable", async () => {
    const wrapper = mount(PreviewPane, {
      global: { plugins: [createPinia()] },
    });
    const host = wrapper.find(".preview-host").element as HTMLElement;
    const style = globalThis.getComputedStyle(host);
    expect(style.userSelect).not.toBe("none");
  });
});
