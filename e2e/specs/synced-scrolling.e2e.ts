import { typeInEditor } from "../helpers/editor";

describe("Markdown-Magic synced scrolling", () => {
  async function typeTallDocument() {
    const lines: string[] = [];
    for (let i = 1; i <= 40; i++) {
      lines.push(`## Section ${i}`, "Some body text for this section.");
    }
    await typeInEditor(lines.join("\n"));
  }

  async function waitForBlocks() {
    const previewHost = await $(
      '[data-testid="preview-pane"] .preview-host',
    );
    await previewHost.waitForExist({ timeout: 15000 });
    await browser.waitUntil(
      async () => {
        const blocks = await $$(
          '[data-testid="preview-pane"] [data-block-index]',
        );
        return blocks.length >= 40;
      },
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the block anchors",
      },
    );
    return previewHost;
  }

  function topmostBlockIndex(): Promise<number> {
    return browser.execute(() => {
      const host = document.querySelector(
        '[data-testid="preview-pane"] .preview-host',
      ) as HTMLElement;
      const hostTop = host.getBoundingClientRect().top;
      let topIndex = -1;
      let best = Infinity;
      for (const block of host.querySelectorAll("[data-block-index]")) {
        const top =
          (block as HTMLElement).getBoundingClientRect().top - hostTop;
        if (top >= 0 && top < best) {
          best = top;
          topIndex = Number(block.getAttribute("data-block-index"));
        }
      }
      return topIndex;
    });
  }

  function scrollEditorTo(scrollTop: number) {
    return browser.execute((value) => {
      const scroller = document.querySelector(
        '[data-testid="editor-pane"] .cm-scroller',
      );
      if (scroller) scroller.scrollTop = value;
    }, scrollTop);
  }

  it("scrolls the Preview Pane to the block matching the Editor Pane's visible region", async () => {
    await browser.pause(1000);
    await typeTallDocument();
    const previewHost = await waitForBlocks();

    await scrollEditorTo(0);
    await browser.pause(600);
    expect(await topmostBlockIndex()).toBe(0);

    await scrollEditorTo(1000000);
    await browser.pause(600);

    const previewScrollTop = await previewHost.getProperty("scrollTop");
    expect(previewScrollTop).toBeGreaterThan(0);
    const bottomIndex = await topmostBlockIndex();
    expect(bottomIndex).toBeGreaterThanOrEqual(30);

    await scrollEditorTo(0);
    await browser.pause(600);
    expect(await topmostBlockIndex()).toBe(0);
  });
});
