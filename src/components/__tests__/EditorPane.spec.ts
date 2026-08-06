import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { EditorView } from "@codemirror/view";
import EditorPane from "../EditorPane.vue";
import { useDocumentStore } from "../../stores/document";

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
});
