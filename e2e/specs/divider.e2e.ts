// Resizable split: the divider in Split View drags to balance the panes, and
// the position is remembered across Layout Mode switches within a session (it
// resets on launch). The E2E drags the divider, measures the Editor Pane,
// cycles away and back to Split View, and asserts the balance held.
describe("Markdown-Magic resizable split", () => {
  async function editorWidth(): Promise<number> {
    return (await $('[data-testid="editor-pane"]').getSize()).width;
  }

  async function dragDividerBy(deltaX: number) {
    const divider = await $('[data-testid="divider"]');
    const location = await divider.getLocation();
    const size = await divider.getSize();
    const startX = Math.round(location.x + size.width / 2);
    const startY = Math.round(location.y + size.height / 2);
    await browser
      .action("pointer")
      .move({ x: startX, y: startY })
      .down()
      .move({ x: startX + deltaX, y: startY })
      .pause(100)
      .up()
      .perform();
  }

  it("drags the divider and holds the balance across mode cycles", async () => {
    await browser.pause(1000);
    await $('[data-testid="divider"]').waitForDisplayed({ timeout: 15000 });
    await browser.pause(200);

    const before = await editorWidth();
    await dragDividerBy(120);
    await browser.pause(300);
    const after = await editorWidth();
    expect(after).toBeGreaterThan(before + 60);

    // Cycle away (Preview Only → Focus Mode) and back to Split View. The
    // within-session divider position must survive the round trip.
    await browser.keys(["Control", "Shift", "P"]);
    await browser.keys(["Control", "Shift", "P"]);
    await browser.keys(["Control", "Shift", "P"]);
    await browser.waitUntil(
      async () => {
        const visible = await $('[data-testid="divider"]').isDisplayed();
        const width = await editorWidth();
        return visible && width >= after - 10 && width <= after + 10;
      },
      {
        timeout: 10000,
        timeoutMsg:
          "divider position was not held on return to Split View",
      },
    );
  });
});
