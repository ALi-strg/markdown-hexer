import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import EditorPane from "../EditorPane.vue";
import { useDocumentStore } from "../../stores/document";
import { applyFormatting } from "../../lib/editorFormatting";

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
    document.newDocument();

    (wrapper.vm as unknown as { replaceContent: (text: string) => void }).replaceContent(
      document.content,
    );

    expect(view.state.doc.toString()).toBe("");
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
