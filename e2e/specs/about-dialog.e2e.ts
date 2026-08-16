// The About Dialog is the app's about surface and the single place every
// shortcut is listed, drawn from the same registry the toolbar tooltips read.
// E2E exercises the real paths: the About button opens it in source-visible
// modes, Cmd/Ctrl+/ toggles it from anywhere (including Preview Only, where
// the button is hidden), Esc / clicking outside / pressing the button again
// dismiss it, and it shows the bundle's version and the repository link.
describe("Markdown Hexer About Dialog", () => {
  async function openFromSourceMode() {
    const editor = await $('[data-testid="editor-pane"]');
    if (!(await editor.isDisplayed())) {
      // A previous test may leave the app in Preview Only; one layout cycle
      // reaches Focus, where the editor (and toolbar) are visible again.
      await browser.keys(["Control", "Shift", "p"]);
    }
    await editor.waitForDisplayed({ timeout: 15000 });
    const about = await $('[data-testid="toolbar-about"]');
    await about.waitForDisplayed({ timeout: 10000 });
    return about;
  }

  it("shows the About tooltip, opens the dialog with version and repository link, and closes with Esc", async () => {
    await browser.pause(1000);
    const about = await openFromSourceMode();
    expect(await about.getAttribute("title")).toBe("About (Ctrl/Cmd+/)");

    await about.click();
    const modal = await $('[data-testid="about-modal"]');
    await modal.waitForDisplayed({ timeout: 10000 });

    const text = await modal.getText();
    expect(text).toContain("About Markdown Hexer");
    // The version comes from the running bundle, so only its presence (not its
    // value) is asserted: dev and PR builds carry the static baseline, tag
    // builds the release version.
    const version = await $('[data-testid="about-version"]');
    expect((await version.getText()).trim()).not.toBe("");
    const repoLink = await $('[data-testid="about-repo-link"]');
    expect(await repoLink.getAttribute("href")).toBe(
      "https://github.com/ALi-strg/markdown-hexer",
    );
    for (const groupId of [
      "shortcut-group-file",
      "shortcut-group-edit",
      "shortcut-group-format",
      "shortcut-group-view",
      "shortcut-group-tab",
      "shortcut-group-app",
    ]) {
      expect(await (await $(`[data-testid="${groupId}"]`)).isDisplayed()).toBe(
        true,
      );
    }
    expect(text).toContain("Save As");
    expect(text).toContain("Ctrl/Cmd+Shift+P");
    expect(text).toContain("Ctrl/Cmd+/");
    // The Tab shortcuts live in their own group of the reference.
    for (const [label, combo] of [
      ["New Tab", "Ctrl/Cmd+T"],
      ["Close Tab", "Ctrl/Cmd+W"],
      ["Next Tab", "Ctrl+Tab"],
      ["Previous Tab", "Ctrl+Shift+Tab"],
    ]) {
      expect(text).toContain(label);
      expect(text).toContain(combo);
    }

    await browser.keys(["Escape"]);
    await browser.waitUntil(
      async () => !(await modal.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Esc did not close the About Dialog" },
    );
  });

  it("toggles the dialog with Cmd/Ctrl+/ from Preview Only, where the About button is hidden", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    const editor = await $('[data-testid="editor-pane"]');
    await browser.waitUntil(
      async () => !(await editor.isDisplayed()),
      { timeout: 10000, timeoutMsg: "did not reach Preview Only" },
    );
    expect(await (await $('[data-testid="toolbar-about"]')).isDisplayed()).toBe(
      false,
    );

    await browser.keys(["Control", "/"]);
    const modal = await $('[data-testid="about-modal"]');
    await modal.waitForDisplayed({ timeout: 10000 });

    await browser.keys(["Control", "/"]);
    await browser.waitUntil(
      async () => !(await modal.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Cmd/Ctrl+/ did not close the dialog" },
    );
  });

  it("closes the dialog on an outside click and on toggling again", async () => {
    await browser.pause(1000);
    const about = await openFromSourceMode();
    await about.click();
    const modal = await $('[data-testid="about-modal"]');
    await modal.waitForDisplayed({ timeout: 10000 });

    // Click the overlay outside the centered modal. Element click offsets are
    // relative to the element's center (which is where the modal sits), so use
    // an explicit viewport point near the top-left corner instead.
    await browser
      .action("pointer")
      .move({ x: 10, y: 10 })
      .down()
      .up()
      .perform();
    await browser.waitUntil(
      async () => !(await modal.isDisplayed()),
      {
        timeout: 10000,
        timeoutMsg: "clicking outside did not close the About Dialog",
      },
    );

    await about.click();
    await modal.waitForDisplayed({ timeout: 10000 });
    // The overlay covers the toolbar while the dialog is open, so the About
    // button cannot receive a pointer click; the toggle shortcut is the app's
    // "press again" path here.
    await browser.keys(["Control", "/"]);
    await browser.waitUntil(
      async () => !(await modal.isDisplayed()),
      {
        timeout: 10000,
        timeoutMsg: "toggling again did not close the About Dialog",
      },
    );
  });
});
