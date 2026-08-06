describe("ALi-md-editor code syntax highlighting", () => {
  async function typeFencedBlock() {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue("```js\nconst x = 1;\n```");
  }

  async function waitForToken() {
    const token = await $('[data-testid="preview-pane"] .token.keyword');
    await token.waitForExist({ timeout: 10000 });
    return token;
  }

  it("renders a fenced block highlighted in the Preview Pane", async () => {
    await browser.pause(1000);
    await typeFencedBlock();

    const token = await waitForToken();
    expect(await token.getText()).toBe("const");
  });

  it("highlights according to the data-theme attribute", async () => {
    await browser.pause(1000);
    await typeFencedBlock();

    const token = await waitForToken();
    await browser.execute(() => {
      document
        .querySelector('[data-testid="app"]')
        ?.setAttribute("data-theme", "light");
    });
    const lightColor = await token.getCSSProperty("color");

    await browser.execute(() => {
      document
        .querySelector('[data-testid="app"]')
        ?.setAttribute("data-theme", "dark");
    });
    const darkColor = await token.getCSSProperty("color");

    expect(lightColor.value).toBeDefined();
    expect(darkColor.value).toBeDefined();
    expect(lightColor.value).not.toBe(darkColor.value);
  });
});
