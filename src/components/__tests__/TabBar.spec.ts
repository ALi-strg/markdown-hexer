import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
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
    untitledNumber: null,
  };
}

const TABS = ["C:\\notes\\a.md", "C:\\notes\\b.md", "C:\\notes\\c.md"].map(
  makeTab,
);

function dataTransfer(): DataTransfer {
  return {
    effectAllowed: "all",
    dropEffect: "none",
    setData: vi.fn(),
    getData: vi.fn(() => ""),
  } as unknown as DataTransfer;
}

function mountBar(tabs: Tab[] = TABS) {
  return mount(TabBar, {
    props: { tabs, activeIndex: 0 },
  });
}

async function trigger(
  wrapper: ReturnType<typeof mountBar>,
  event: string,
  index: number,
  payload: object,
) {
  await wrapper.findAll('[data-testid="tab"]')[index].trigger(event, payload);
}

describe("TabBar tab reordering", () => {
  it("emits move from the dragged Tab's index to the hovered Tab's index", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 2, {
      dataTransfer: dataTransfer(),
    });
    await trigger(wrapper, "dragover", 0, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("move")).toEqual([[2, 0]]);
  });

  it("tracks the dragged Tab across successive boundary crossings", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 0, {
      dataTransfer: dataTransfer(),
    });
    await trigger(wrapper, "dragover", 1, { dataTransfer: dataTransfer() });
    await trigger(wrapper, "dragover", 2, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("move")).toEqual([[0, 1], [1, 2]]);
  });

  it("does not emit move when hovering the dragged Tab itself", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 1, {
      dataTransfer: dataTransfer(),
    });
    await trigger(wrapper, "dragover", 1, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("does not emit move before a drag starts", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragover", 0, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("emits a move to the end for a drop on the empty strip right of the Tabs", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 0, {
      dataTransfer: dataTransfer(),
    });
    await wrapper.find('[data-testid="tab-bar"]').trigger("drop", {
      dataTransfer: dataTransfer(),
    });

    expect(wrapper.emitted("move")).toEqual([[0, 2]]);
  });

  it("does not emit a move to the end when the last Tab is dragged and dropped on the strip", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 2, {
      dataTransfer: dataTransfer(),
    });
    await wrapper.find('[data-testid="tab-bar"]').trigger("drop", {
      dataTransfer: dataTransfer(),
    });

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("stops tracking when the drag ends", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 0, {
      dataTransfer: dataTransfer(),
    });
    await trigger(wrapper, "dragend", 0, { dataTransfer: dataTransfer() });
    await trigger(wrapper, "dragover", 1, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("keeps the close control working on a draggable Tab", async () => {
    const wrapper = mountBar();

    await wrapper.findAll('[data-testid="tab-close"]')[1].trigger("click");

    expect(wrapper.emitted("close")).toEqual([[1]]);
    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("keeps activation on click and never activates through the drag path", async () => {
    const wrapper = mountBar();
    await trigger(wrapper, "dragstart", 1, {
      dataTransfer: dataTransfer(),
    });
    await trigger(wrapper, "dragover", 2, { dataTransfer: dataTransfer() });

    expect(wrapper.emitted("activate")).toBeUndefined();

    await trigger(wrapper, "click", 0, {});

    expect(wrapper.emitted("activate")).toEqual([[0]]);
  });
});
