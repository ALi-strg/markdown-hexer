// Text Size: one shared pick (Small / Medium / Large) that applies to both the
// Editor Pane and the Preview Pane and persists in localStorage. Medium is the
// default look (editor 14px, preview 15px). The E2E switches sizes and asserts
// `data-text-size` plus the computed font-size of both panes actually change.
describe("Markdown-Magic text size", () => {
  const SIZE_VALUES: Record<string, string> = {
    Small: "small",
    Medium: "medium",
    Large: "large",
  };

  async function appSize(): Promise<string | null> {
    return $('[data-testid="app"]').getAttribute("data-text-size");
  }

  async function editorSize(): Promise<number> {
    const editor = await $('[data-testid="editor-pane"] .cm-scroller');
    return browser.execute(
      (el) => parseFloat(getComputedStyle(el).fontSize),
      editor,
    );
  }

  async function paneSize(): Promise<number> {
    const pane = await $('[data-testid="preview-pane"] .preview-host');
    return browser.execute(
      (el) => parseFloat(getComputedStyle(el).fontSize),
      pane,
    );
  }

  async function setSize(label: string) {
    const select = await $('[data-testid="toolbar-size"]');
    await select.selectByVisibleText(label);
    await browser.waitUntil(
      async () => (await appSize()) === SIZE_VALUES[label],
      {
        timeout: 10000,
        timeoutMsg: `text size did not switch to "${label}"`,
      },
    );
  }

  it("starts from the Medium size as the default look", async () => {
    await browser.pause(1000);
    await setSize("Medium");
    expect(await appSize()).toBe("medium");
    expect(await editorSize()).toBe(14);
    expect(await paneSize()).toBe(15);
  });

  it("switches to Small and shrinks both panes", async () => {
    await setSize("Small");
    expect(await appSize()).toBe("small");
    expect(await editorSize()).toBe(12);
    expect(await paneSize()).toBe(13);
  });

  it("switches to Large and grows both panes", async () => {
    await setSize("Large");
    expect(await appSize()).toBe("large");
    expect(await editorSize()).toBe(16);
    expect(await paneSize()).toBe(17);
  });

  it("persists the chosen text size for the next launch", async () => {
    await setSize("Large");
    const stored = await browser.execute(() =>
      localStorage.getItem("markdownmagic:settings"),
    );
    expect(stored).toContain("large");
  });

  it("leaves the app in the Medium size for later specs", async () => {
    await setSize("Medium");
    expect(await appSize()).toBe("medium");
  });
});
