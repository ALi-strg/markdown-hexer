import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { nextTick } from "vue";
import { createTabSession, type TabSessionDeps } from "../tabEditorState";
import type { Tab } from "../../stores/document";

function makeTab(content: string): Tab {
  return {
    content,
    canonicalPath: null,
    savedContent: "",
    diskContent: null,
    layoutMode: "split",
    findQuery: "",
    currentMatch: null,
    collapsedSections: [],
    untitledNumber: null,
  };
}

function stateWith(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
  });
}

interface FakeView {
  state: EditorState;
  scrollDOM: { scrollTop: number };
  setState(next: EditorState): void;
}

function fakeView(state: EditorState): FakeView {
  return {
    state,
    scrollDOM: { scrollTop: 0 },
    setState(next) {
      this.state = next;
    },
  };
}

interface Harness {
  session: ReturnType<typeof createTabSession>;
  view: FakeView;
  events: string[];
  setActive(tab: Tab): void;
  setVisible(visible: boolean): void;
}

function makeHarness(initialState: EditorState): Harness {
  const view = fakeView(initialState);
  let active = makeTab(initialState.doc.toString());
  let visible = true;
  const events: string[] = [];
  const deps: TabSessionDeps = {
    getView: () => view as unknown as EditorView,
    getActiveTab: () => active,
    isPaneVisible: () => visible,
    getContent: () => active.content,
    createState: (doc) => {
      events.push("create");
      return stateWith(doc, 0);
    },
    onHistorySync: () => {},
    onSwitched: () => {
      events.push("switched");
    },
    onRestored: () => {
      events.push("restored");
    },
  };
  return {
    session: createTabSession(deps),
    view,
    events,
    setActive: (tab) => {
      active = tab;
    },
    setVisible: (value) => {
      visible = value;
    },
  };
}

describe("tab session controller", () => {
  it("travels cursor, scroll, and undo history across a switch round-trip", async () => {
    const stateA = stateWith("A doc", 5);
    const tabA = makeTab("A doc");
    const tabB = makeTab("B doc");
    const harness = makeHarness(stateA);
    harness.setActive(tabA);
    harness.view.scrollDOM.scrollTop = 123;

    // A → B: A's state is captured, B has no preserved state and rebuilds.
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabB), true),
      after: () => "restore",
    });
    await nextTick();
    expect(harness.view.state.doc.toString()).toBe("B doc");
    expect(harness.view.scrollDOM.scrollTop).toBe(0);

    // The user works in B: selection, scroll, and history move with the state.
    const editedB = stateWith("B doc edited", 7);
    harness.view.state = editedB;
    harness.view.scrollDOM.scrollTop = 55;

    // B → A: B's edited state is captured, A's travels back verbatim.
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabA), true),
      after: () => "restore",
    });
    await nextTick();
    expect(harness.view.state).toBe(stateA);
    expect(harness.view.state.selection.main.from).toBe(5);
    expect(harness.view.scrollDOM.scrollTop).toBe(123);
  });

  it("pins the switch protocol order: capture, swap, close overlay, restore, external check", async () => {
    const tabB = makeTab("B");
    const harness = makeHarness(stateWith("A", 0));
    harness.session.runTabSwitch({
      swap: () => {
        harness.events.push("swap");
        harness.setActive(tabB);
        return true;
      },
      after: () => "restore",
    });
    expect(harness.events).toEqual(["swap", "switched", "create", "restored"]);
    await nextTick();
  });

  it("supports an async swap (Open's dialog round-trip) with a result-driven mode", async () => {
    const tabB = makeTab("B doc");
    const harness = makeHarness(stateWith("A doc", 0));
    const done = harness.session.runTabSwitch({
      swap: async () => (harness.setActive(tabB), "opened"),
      after: (result) => (result === "opened" ? "rebuild" : null),
    });
    // Capture ran synchronously; the swap's dialog round-trip has not.
    expect(harness.view.state.doc.toString()).toBe("A doc");
    await done;
    await nextTick();
    expect(harness.view.state.doc.toString()).toBe("B doc");
    expect(harness.events).not.toContain("restored");
  });

  it("capture: false leaves the outgoing Tab uncaptured (closing a Tab discards its state)", async () => {
    const stateA = stateWith("A", 0);
    const tabB = makeTab("B");
    const tabA = makeTab("A");
    const harness = makeHarness(stateA);
    harness.setActive(tabA);

    harness.session.runTabSwitch({
      capture: false,
      swap: () => (harness.setActive(tabB), true),
      after: () => "restore",
    });
    await nextTick();
    // Back to A: nothing was captured for A, so it rebuilds instead of restoring.
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabA), true),
      after: () => "restore",
    });
    await nextTick();
    expect(harness.view.state).not.toBe(stateA);
  });

  it("captures even when the swap is refused", async () => {
    const stateA = stateWith("A", 0);
    const tabB = makeTab("B");
    const tabA = makeTab("A");
    const harness = makeHarness(stateA);
    harness.setActive(tabA);

    harness.session.runTabSwitch({
      swap: () => null,
      after: () => "restore",
    });
    expect(harness.view.state).toBe(stateA);

    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabB), true),
      after: () => "restore",
    });
    await nextTick();
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabA), true),
      after: () => "restore",
    });
    await nextTick();
    expect(harness.view.state).toBe(stateA);
  });

  it("defers a restored scroll offset until the pane becomes visible", async () => {
    const tabB = makeTab("B");
    const tabA = makeTab("A");
    const harness = makeHarness(stateWith("B", 0));
    harness.setActive(tabB);
    harness.view.scrollDOM.scrollTop = 77;

    // B → A captures B's scroll offset while the pane is visible.
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabA), true),
      after: () => "restore",
    });
    await nextTick();

    // A → B with the pane hidden (B's Layout Mode is Preview Only): the offset
    // cannot be applied, so it is deferred, not dropped.
    harness.setVisible(false);
    harness.session.runTabSwitch({
      swap: () => (harness.setActive(tabB), true),
      after: () => "restore",
    });
    await nextTick();
    expect(harness.view.scrollDOM.scrollTop).toBe(0);

    harness.setVisible(true);
    harness.session.flushPendingScroll();
    expect(harness.view.scrollDOM.scrollTop).toBe(77);
  });

  it("rebuild is the external-reload path: fresh state from the store", async () => {
    const tabA = makeTab("fresh from disk");
    const harness = makeHarness(stateWith("stale", 3));
    harness.setActive(tabA);
    harness.session.rebuild();
    await nextTick();
    expect(harness.view.state.doc.toString()).toBe("fresh from disk");
    expect(harness.events).toEqual(["create"]);
  });
});
