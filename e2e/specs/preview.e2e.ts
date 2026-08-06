describe("ALi-md-editor live preview", () => {
  it("renders markdown in the Preview Pane as the user types", async () => {
    await browser.pause(1000);

    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue("# Hello");

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => {
        const html = await preview.getHTML();
        return html.includes("<h1") && html.includes("Hello");
      },
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the typed markdown",
      },
    );
  });
});
