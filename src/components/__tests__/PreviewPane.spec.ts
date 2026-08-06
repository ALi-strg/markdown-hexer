import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import PreviewPane from "../PreviewPane.vue";
import { useDocumentStore } from "../../stores/document";

function previewHtml(
  wrapper: ReturnType<typeof mount>,
): string {
  return wrapper.find(".preview-host").element.innerHTML;
}

describe("PreviewPane", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
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
});
