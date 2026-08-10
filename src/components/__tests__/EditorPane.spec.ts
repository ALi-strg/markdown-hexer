import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { undoDepth } from "@codemirror/commands";
import EditorPane from "../EditorPane.vue";
import { useDocumentStore } from "../../stores/document";
import { applyFormatting } from "../../lib/editorFormatting";
import {
  clearPreservedTabEditorState,
  getPreservedTabEditorState,
} from "../../lib/tabEditorState";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("EditorPane", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  async function mountWithView() {
    const wrapper = mount(EditorPane, {
      global: { plugins: [createPinia()] },
    });
    const view = (wrapper.vm as unknown as { view: EditorView }).view;
    return { wrapper, view };
  }

  it("mirrors typed text into the document store and marks it Dirty", async () => {
    const { view } = await mountWithView();
    const document = useDocumentStore();

    view.dispatch({ changes: { from: 0, insert: "Hello" } });

    expect(document.content).toBe("Hello");
    expect(document.dirty).toBe(true);
  });

  it("never writes the store back into the editor", async () => {
    const { view } = await mountWithView();

    view.dispatch({ changes: { from: 0, insert: "Hello" } });
    expect(view.state.doc.toString()).toBe("Hello");

    const document = useDocumentStore();
    document.mirrorContent("Changed from outside");

    expect(view.state.doc.toString()).toBe("Hello");
  });

  it("replaces the editor content on a Document swap", async () => {
    const { wrapper, view } = await mountWithView();
    const document = useDocumentStore();
    document.mirrorContent("# Draft");
    document.canonicalPath = "C:\\notes\\a.md";

    (wrapper.vm as unknown as { replaceContent: (text: string) => void }).replaceContent(
      document.content,
    );

    expect(view.state.doc.toString()).toBe("# Draft");
  });

  it("replaces the editor content on a swap to an Untitled Document", async () => {
    const { wrapper, view } = await mountWithView();

    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    const document = useDocumentStore();
    document.newTab();

    (wrapper.vm as unknown as { replaceContent: (text: string) => void }).replaceContent(
      document.content,
    );

    expect(view.state.doc.toString()).toBe("");
  });

  it("preserves cursor and undo history across a capture/restore round trip", async () => {
    const { wrapper, view } = await mountWithView();
    const document = useDocumentStore();
    const pane = wrapper.vm as unknown as {
      captureActiveTabState: () => void;
      restoreActiveTabState: () => void;
    };

    view.dispatch({ changes: { from: 0, insert: "# Draft\n\nBody" } });
    view.dispatch({ selection: { anchor: 8 } });
    expect(undoDepth(view.state)).toBe(1);

    // Switch away: the launch Tab's live state is preserved for it.
    pane.captureActiveTabState();
    expect(getPreservedTabEditorState(document.tabs[0])).not.toBeNull();

    // A fresh Tab becomes Active: restore rebuilds it with no history.
    document.newTab();
    pane.restoreActiveTabState();
    expect(view.state.doc.toString()).toBe("");
    expect(undoDepth(view.state)).toBe(0);

    // Switch back: the preserved state restores cursor and undo history.
    document.switchTab(0);
    pane.restoreActiveTabState();
    expect(view.state.doc.toString()).toBe("# Draft\n\nBody");
    expect(view.state.selection.main.head).toBe(8);
    expect(undoDepth(view.state)).toBe(1);
  });

  it("restores the captured scroll offset on restore", async () => {
    const { wrapper, view } = await mountWithView();
    const document = useDocumentStore();
    const pane = wrapper.vm as unknown as {
      captureActiveTabState: () => void;
      restoreActiveTabState: () => void;
    };

    view.scrollDOM.scrollTop = 240;
    pane.captureActiveTabState();
    expect(getPreservedTabEditorState(document.tabs[0])?.scrollTop).toBe(240);

    document.newTab();
    document.switchTab(0);
    pane.restoreActiveTabState();
    await nextTick();

    expect(view.scrollDOM.scrollTop).toBe(240);
  });

  it("rebuilds from the store with cleared undo when the Tab has no preserved state", async () => {
    const { wrapper, view } = await mountWithView();
    const document = useDocumentStore();
    const pane = wrapper.vm as unknown as {
      restoreActiveTabState: () => void;
    };

    view.dispatch({ changes: { from: 0, insert: "# Draft" } });
    // The Document's content was replaced from disk without the editor (an
    // external reload clears the preserved state), so the restore must rebuild
    // and clear the undo history exactly like New/Open.
    document.mirrorContent("# Rebuilt");
    clearPreservedTabEditorState(document.tabs[0]);

    pane.restoreActiveTabState();

    expect(view.state.doc.toString()).toBe("# Rebuilt");
    expect(undoDepth(view.state)).toBe(0);
  });

  it("applies formatting through a CodeMirror transaction", async () => {
    const { view } = await mountWithView();
    view.dispatch({ changes: { from: 0, insert: "hello world" } });
    view.dispatch({
      selection: EditorSelection.range(0, 5),
    });

    applyFormatting(view, "bold");

    expect(view.state.doc.toString()).toBe("**hello** world");
  });

  it("mirrors a formatting change into the document store", async () => {
    const { view } = await mountWithView();
    const document = useDocumentStore();
    view.dispatch({ changes: { from: 0, insert: "hello" } });
    view.dispatch({
      selection: EditorSelection.range(0, 5),
    });

    applyFormatting(view, "bold");

    expect(document.content).toBe("**hello**");
    expect(document.dirty).toBe(true);
  });
});
