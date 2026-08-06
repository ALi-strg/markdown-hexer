import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import App from "../App.vue";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("App shell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the workspace in Split View with both panes", () => {
    const wrapper = mount(App);
    expect(wrapper.find('[data-testid="editor-pane"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-pane"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app"]').attributes("data-theme")).toBe(
      "system",
    );
  });

  it("syncs the window title on mount", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    mount(App);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invoke).toHaveBeenCalledWith("set_document_title", {
      filename: "Untitled.md",
      dirty: false,
    });
  });
});
