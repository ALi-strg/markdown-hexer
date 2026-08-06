describe("ALi-md-editor editing core", () => {
  it("marks the Document Dirty while typing and reverts on undo", async () => {
    await browser.pause(1000);

    expect(await browser.getTitle()).toBe("Untitled.md — ALi-md-editor");

    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue("Hello world");

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md * — ALi-md-editor",
      { timeout: 10000, timeoutMsg: "asterisk did not appear in title" },
    );

    expect(await editorContent.getText()).toContain("Hello world");

    await browser.keys(["Control", "z"]);
    await browser.pause(300);

    expect(await editorContent.getText()).not.toContain("Hello world");

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md — ALi-md-editor",
      { timeout: 10000, timeoutMsg: "asterisk did not clear after undo" },
    );
  });
});
