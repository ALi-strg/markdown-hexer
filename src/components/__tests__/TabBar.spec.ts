import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import TabBar from "../TabBar.vue";
import type { Tab } from "../../stores/document";

function makeTab(canonicalPath: string): Tab {
  return {
    content: "",
    canonicalPath,
    savedContent: "",
    diskContent: "",
    layoutMode: "split",
    findQuery: "",
    currentMatch: null,
    collapsedSections: [],
    untitledNumber: null,
  };
}

const TABS = ["C:\\notes\\a.md", "C:\\notes\\b.md", "C:\\notes\\c.md"].map(
  makeTab,
);

function mountBar(tabs: Tab[] = TABS) {
  return mount(TabBar, {
    props: { tabs, activeIndex: 0 },
  });
}

type Bar = ReturnType<typeof mountBar>;

function tabButton(wrapper: Bar, index: number) {
  return wrapper.findAll('[data-testid="tab"]')[index];
}

/// Dispatches a real PointerEvent — VTU's `trigger` cannot attach read-only
/// properties like `button` to jsdom's PointerEvent instances.
async function fire(
  wrapper: Bar,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  index: number,
  x = 0,
  y = 0,
) {
  tabButton(wrapper, index).element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    }),
  );
  await nextTick();
}

const press = (wrapper: Bar, index: number, x: number, y: number) =>
  fire(wrapper, "pointerdown", index, x, y);
const move = (wrapper: Bar, x: number, y: number) =>
  fire(wrapper, "pointermove", 0, x, y);
const release = (wrapper: Bar, x: number, y: number) =>
  fire(wrapper, "pointerup", 0, x, y);

/// Stubs `document.elementFromPoint` (unimplemented in jsdom) to report the
/// Tab at `index` — or nothing when `index` is null — as the pointer target.
/// `index` is a *current* position, so live reorders mid-drag stay coherent.
function stubPointerOver(wrapper: Bar, index: number | null) {
  (document as unknown as Record<string, unknown>).elementFromPoint = vi.fn(
    () => {
      if (index === null) {
        return null;
      }
      return tabButton(wrapper, index).element;
    },
  );
}

function stubBarRect(wrapper: Bar, rect: Partial<DOMRect>) {
  const bar = wrapper.find('[data-testid="tab-bar"]').element as HTMLElement;
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 1000,
    top: 0,
    bottom: 30,
    x: 0,
    y: 0,
    width: 1000,
    height: 30,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).elementFromPoint;
  vi.restoreAllMocks();
});

describe("TabBar tab reordering", () => {
  it("emits move once the press crosses the drag threshold onto another Tab", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 0);

    await press(wrapper, 2, 200, 10);
    await move(wrapper, 210, 10); // 10px > threshold, pointer over Tab 0

    expect(wrapper.emitted("move")).toEqual([[2, 0]]);
  });

  it("does not emit move below the drag threshold", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 0);

    await press(wrapper, 2, 200, 10);
    await move(wrapper, 202, 10); // 2px < threshold

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("tracks the dragged Tab across successive boundary crossings", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 1);

    await press(wrapper, 0, 100, 10);
    await move(wrapper, 110, 10);
    stubPointerOver(wrapper, 2);
    await move(wrapper, 120, 10);

    expect(wrapper.emitted("move")).toEqual([[0, 1], [1, 2]]);
  });

  it("does not emit move when hovering the dragged Tab itself", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 1);

    await press(wrapper, 1, 100, 10);
    await move(wrapper, 110, 10);

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("does not emit move before a press on a Tab", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 0);

    await move(wrapper, 110, 10);

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("emits a move to the end for a release on the strip right of the Tabs", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 0);
    await press(wrapper, 0, 100, 10);
    await move(wrapper, 110, 10);
    stubPointerOver(wrapper, null);
    stubBarRect(wrapper, {});

    await release(wrapper, 990, 10);

    expect(wrapper.emitted("move")).toEqual([[0, 2]]);
  });

  it("does not emit a move to the end when the last Tab is released on the strip", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 2);
    await press(wrapper, 2, 200, 10);
    await move(wrapper, 210, 10);
    stubPointerOver(wrapper, null);
    stubBarRect(wrapper, {});

    await release(wrapper, 990, 10);

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("treats a release outside the bar as an aborted drag without a reorder", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 0);
    await press(wrapper, 0, 100, 10);
    await move(wrapper, 110, 10);
    stubPointerOver(wrapper, null);
    stubBarRect(wrapper, {});

    await release(wrapper, 990, 200); // below the bar

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("stops tracking after pointerup", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 1);
    await press(wrapper, 0, 100, 10);
    await move(wrapper, 110, 10);
    await release(wrapper, 110, 10);
    stubPointerOver(wrapper, 2);

    await move(wrapper, 120, 10);

    expect(wrapper.emitted("move")).toEqual([[0, 1]]);
  });

  it("stops tracking on pointercancel", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 1);
    await press(wrapper, 0, 100, 10);
    await move(wrapper, 110, 10);
    await fire(wrapper, "pointercancel", 0);
    stubPointerOver(wrapper, 2);

    await move(wrapper, 120, 10);

    expect(wrapper.emitted("move")).toEqual([[0, 1]]);
  });

  it("keeps the close control working on a Tab", async () => {
    const wrapper = mountBar();

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");

    expect(wrapper.emitted("close")).toEqual([[1]]);
    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("keeps activation on click and never activates through the drag path", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 2);

    await press(wrapper, 1, 100, 10);
    await move(wrapper, 110, 10); // real drag: must not activate anything

    expect(wrapper.emitted("activate")).toBeUndefined();

    // The click that follows the drag's pointerup is swallowed...
    await tabButton(wrapper, 1).trigger("click");
    expect(wrapper.emitted("activate")).toBeUndefined();

    // ...while a plain click on another Tab still activates it.
    await tabButton(wrapper, 0).trigger("click");
    expect(wrapper.emitted("activate")).toEqual([[0]]);
  });

  it("still activates a Tab whose press never crossed the threshold", async () => {
    const wrapper = mountBar();
    stubPointerOver(wrapper, 1);

    await press(wrapper, 1, 100, 10);
    await move(wrapper, 102, 10); // jitter, below threshold
    await release(wrapper, 102, 10);
    await tabButton(wrapper, 1).trigger("click");

    expect(wrapper.emitted("activate")).toEqual([[1]]);
  });
});
