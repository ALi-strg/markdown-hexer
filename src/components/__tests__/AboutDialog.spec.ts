import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AboutDialog from "../AboutDialog.vue";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

const invokeMock = vi.mocked(invoke);
const openUrlMock = vi.mocked(openUrl);

/// The About Dialog's repository link target, the same URL the dialog's
/// open-repository action resolves to.
const REPO_URL = "https://github.com/ALi-strg/markdown-hexer";

describe("AboutDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openUrlMock.mockReset();
    invokeMock.mockResolvedValue("1.2.3");
  });

  it("asks the backend for the version and shows it with the product name", async () => {
    const wrapper = mount(AboutDialog);
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("get_app_version");
    const modal = wrapper.find('[data-testid="about-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("About Markdown Hexer");
    expect(wrapper.find('[data-testid="about-version"]').text()).toBe(
      "Version 1.2.3",
    );
  });

  it("hides the version line when the backend read fails", async () => {
    invokeMock.mockRejectedValue("unavailable");
    const wrapper = mount(AboutDialog);
    await flushPromises();

    expect(wrapper.find('[data-testid="about-version"]').exists()).toBe(false);
  });

  it("renders the shortcut groups, including the About entry with its combo", async () => {
    const wrapper = mount(AboutDialog);
    await flushPromises();

    const modal = wrapper.find('[data-testid="about-modal"]');
    for (const id of [
      "shortcut-group-file",
      "shortcut-group-edit",
      "shortcut-group-format",
      "shortcut-group-view",
      "shortcut-group-tab",
      "shortcut-group-app",
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }
    expect(modal.text()).toContain("About");
    expect(modal.text()).toContain("Ctrl/Cmd+/");
  });

  it("opens the repository URL in the default browser when the link is clicked", async () => {
    const wrapper = mount(AboutDialog);
    await wrapper.find('[data-testid="about-repo-link"]').trigger("click");

    expect(openUrlMock).toHaveBeenCalledWith(REPO_URL);
    // The link must never navigate the app window itself.
    expect(wrapper.find('[data-testid="about-repo-link"]').attributes("href")).toBe(
      REPO_URL,
    );
  });

  it("emits close when the overlay outside the modal is clicked", async () => {
    const wrapper = mount(AboutDialog);
    await wrapper.find('[data-testid="about-overlay"]').trigger("click");

    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("does not emit close when the modal itself is clicked", async () => {
    const wrapper = mount(AboutDialog);
    await wrapper.find('[data-testid="about-modal"]').trigger("click");

    expect(wrapper.emitted("close")).toBeFalsy();
  });

  it("moves focus into the dialog on open and restores it on dismissal", async () => {
    const wrapper = mount(AboutDialog, { attachTo: document.body });
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="about-modal"]').element,
    );

    wrapper.unmount();
    expect(document.activeElement).toBe(document.body);
  });
});
