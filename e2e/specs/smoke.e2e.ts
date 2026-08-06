describe("ALi-md-editor smoke test", () => {
  it("opens with the Untitled.md title and both panes in Split View", async () => {
    await browser.pause(1000);

    expect(await browser.getTitle()).toBe("Untitled.md — ALi-md-editor");

    const editorPane = await $('[data-testid="editor-pane"]');
    const previewPane = await $('[data-testid="preview-pane"]');

    await editorPane.waitForDisplayed({ timeout: 15000 });
    await previewPane.waitForDisplayed({ timeout: 15000 });

    expect(await editorPane.isDisplayed()).toBe(true);
    expect(await previewPane.isDisplayed()).toBe(true);
  });
});
