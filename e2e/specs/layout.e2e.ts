describe("Markdown Hexer layout modes", () => {
  it("cycles through Layout Modes with Cmd/Ctrl+Shift+P, showing and hiding panes", async () => {
    await browser.pause(1000);

    const editorPane = await $('[data-testid="editor-pane"]');
    const previewPane = await $('[data-testid="preview-pane"]');
    await editorPane.waitForDisplayed({ timeout: 15000 });

    expect(await editorPane.isDisplayed()).toBe(true);
    expect(await previewPane.isDisplayed()).toBe(true);

    await browser.keys(["Control", "Shift", "P"]);
    await browser.waitUntil(
      async () => !(await editorPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Editor Pane stayed visible in Preview Only" },
    );
    expect(await previewPane.isDisplayed()).toBe(true);

    await browser.keys(["Control", "Shift", "P"]);
    await browser.waitUntil(
      async () => !(await previewPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Preview Pane stayed visible in Focus Mode" },
    );
    expect(await editorPane.isDisplayed()).toBe(true);

    await browser.keys(["Control", "Shift", "P"]);
    await browser.waitUntil(
      async () =>
        (await editorPane.isDisplayed()) && (await previewPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Panes did not return to Split View" },
    );
  });

  it("switches Layout Modes from the Layout Switcher segments", async () => {
    await browser.pause(1000);

    const editorPane = await $('[data-testid="editor-pane"]');
    const previewPane = await $('[data-testid="preview-pane"]');
    await editorPane.waitForDisplayed({ timeout: 15000 });

    await (await $('[data-testid="layout-preview"]')).click();
    await browser.waitUntil(
      async () => !(await editorPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Preview segment did not hide the Editor Pane" },
    );
    expect(await previewPane.isDisplayed()).toBe(true);

    await (await $('[data-testid="layout-focus"]')).click();
    await browser.waitUntil(
      async () => !(await previewPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Focus segment did not hide the Preview Pane" },
    );
    expect(await editorPane.isDisplayed()).toBe(true);

    await (await $('[data-testid="layout-split"]')).click();
    await browser.waitUntil(
      async () =>
        (await editorPane.isDisplayed()) && (await previewPane.isDisplayed()),
      { timeout: 10000, timeoutMsg: "Split segment did not restore both panes" },
    );
  });
});
