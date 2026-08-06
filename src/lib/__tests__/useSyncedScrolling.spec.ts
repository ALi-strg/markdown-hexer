import { describe, it, expect, vi } from "vitest";
import { useSyncedScrolling } from "../useSyncedScrolling";
import type { SyncedScrollingView } from "../useSyncedScrolling";

const SOURCE = "# A\n\npara\n\n## B";

function fakeView(visibleLine: number): SyncedScrollingView {
  return {
    lineBlockAtHeight: () => ({ from: 0 }),
    state: {
      doc: {
        lineAt: () => ({ number: visibleLine }),
      },
    },
    scrollDOM: document.createElement("div"),
  };
}

function fakeHost(blockTops: Record<string, number>) {
  const host = document.createElement("div");
  host.scrollTop = 0;
  Object.defineProperty(host, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: 20 } as DOMRect),
  });
  for (const [index, top] of Object.entries(blockTops)) {
    const block = document.createElement("div");
    block.setAttribute("data-block-index", index);
    Object.defineProperty(block, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top } as DOMRect),
    });
    host.appendChild(block);
  }
  return host;
}

function depsWith(
  host: HTMLElement,
  view: SyncedScrollingView,
  layoutMode: "split" | "preview" | "focus" = "split",
) {
  return {
    getView: () => view,
    getPreviewHost: () => host,
    getLayoutMode: () => layoutMode,
    getSource: () => SOURCE,
  };
}

describe("useSyncedScrolling", () => {
  it("scrolls the Preview Pane to the block matching the Editor Pane's visible line", () => {
    const host = fakeHost({ 0: 40, 1: 120, 2: 200 });
    const view = fakeView(3);
    const { sync } = useSyncedScrolling(depsWith(host, view));

    sync(view);

    expect(host.scrollTop).toBe(100);
  });

  it("uses the editor view from deps when none is passed", () => {
    const host = fakeHost({ 0: 40, 1: 120, 2: 200 });
    const view = fakeView(3);
    const { sync } = useSyncedScrolling(depsWith(host, view));

    sync();

    expect(host.scrollTop).toBe(100);
  });

  it("does nothing when not in Split View", () => {
    const host = fakeHost({ 0: 40, 1: 120, 2: 200 });
    const view = fakeView(3);
    const { sync } = useSyncedScrolling(
      depsWith(host, view, "focus"),
    );

    sync(view);

    expect(host.scrollTop).toBe(0);
  });

  it("clamps to the last block when the visible line is past the content", () => {
    const host = fakeHost({ 0: 40, 1: 120, 2: 200 });
    const view = fakeView(99);
    const { sync } = useSyncedScrolling(depsWith(host, view));

    sync(view);

    expect(host.scrollTop).toBe(180);
  });

  it("is a no-op when the Preview Pane has not rendered blocks yet", () => {
    const host = document.createElement("div");
    host.scrollTop = 7;
    const view = fakeView(3);
    const { sync } = useSyncedScrolling(depsWith(host, view));

    sync(view);

    expect(host.scrollTop).toBe(7);
  });

  it("attaches and detaches a passive scroll listener on the editor scroller", () => {
    const host = fakeHost({ 0: 40 });
    const view = fakeView(1);
    const addSpy = vi.spyOn(view.scrollDOM, "addEventListener");
    const removeSpy = vi.spyOn(view.scrollDOM, "removeEventListener");
    const { attach, detach } = useSyncedScrolling(depsWith(host, view));

    attach();
    expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), {
      passive: true,
    });

    detach();
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
