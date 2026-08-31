import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import PreviewPane from "../PreviewPane.vue";
import previewPaneSource from "../PreviewPane.vue?raw";
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
      invoke: vi.fn(),
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
});

/// Decodes the body of a CSS string token the way every browser must, per
/// CSS Syntax Level 3 §4.3.7 "consume an escaped code point": a `\` followed
/// by 1-6 hex digits is a code point escape (one optional whitespace after it
/// is consumed); a `\` followed by any other character escapes that character
/// literally. This is why `"\25B8"` is the ▸ glyph while the JS-style
/// `"\u25B8"` is the literal text `u25B8` — `\u` escapes `u`, and the rest is
/// ordinary characters.
function cssStringDecode(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; ) {
    if (raw[i] !== "\\") {
      out += raw[i];
      i += 1;
      continue;
    }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(raw.slice(i + 1));
    if (hex) {
      const cp = parseInt(hex[0], 16);
      out +=
        cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)
          ? "\uFFFD"
          : String.fromCodePoint(cp);
      i += 1 + hex[0].length;
      if (raw[i] === " " || raw[i] === "\t" || raw[i] === "\n" || raw[i] === "\f") {
        i += 1;
      } else if (raw[i] === "\r") {
        i += raw[i + 1] === "\n" ? 2 : 1;
      }
      continue;
    }
    if (i + 1 >= raw.length) {
      out += "\uFFFD"; // a lone `\` at EOF
      i += 1;
      continue;
    }
    out += raw[i + 1];
    i += 2;
  }
  return out;
}

describe("Section chevron glyph", () => {
  // The seam is the source: jsdom cannot compute pseudo-element styles and
  // Vitest skips CSS processing, so the glyph contract is pinned where it is
  // authored — the `content` declaration inside PreviewPane.vue, fetched
  // exactly as Vite hands it to the compiler — and checked with the exact
  // algorithm a browser applies to it.
  const declaration = previewPaneSource.match(
    /\.md-chevron::before\s*\)?\s*\{[^}]*?content:\s*"((?:[^"\\]|\\.)*)"/,
  );

  it("encodes the chevron as the CSS escape for U+25B8, not a JS \\u escape", () => {
    if (!declaration) {
      throw new Error(".md-chevron::before content declaration not found in PreviewPane.vue");
    }
    expect(cssStringDecode(declaration[1])).toBe("\u25B8");
  });
});
