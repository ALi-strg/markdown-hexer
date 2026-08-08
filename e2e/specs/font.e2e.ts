// Font: one shared pick of ~4 curated system stacks that applies to both the
// Editor Pane and the Preview Pane and persists in localStorage. The E2E
// switches fonts and asserts `data-font` plus the computed font-family of both
// panes actually change.
describe("Markdown-Magic font", () => {
  const FONT_VALUES: Record<string, string> = {
    Default: "default",
    Serif: "serif",
    Sans: "sans",
    Mono: "mono",
  };

  async function appFont(): Promise<string | null> {
    return $('[data-testid="app"]').getAttribute("data-font");
  }

  async function paneFont(testid: string): Promise<string> {
    const pane = await $(`[data-testid="${testid}"] .preview-host`);
    return browser.execute((el) => getComputedStyle(el).fontFamily, pane);
  }

  async function editorFont(): Promise<string> {
    const editor = await $('[data-testid="editor-pane"] .cm-scroller');
    return browser.execute((el) => getComputedStyle(el).fontFamily, editor);
  }

  async function setFont(label: string) {
    const select = await $('[data-testid="toolbar-font"]');
    await select.selectByVisibleText(label);
    await browser.waitUntil(
      async () => (await appFont()) === FONT_VALUES[label],
      {
        timeout: 10000,
        timeoutMsg: `font did not switch to "${label}"`,
      },
    );
  }

  it("starts from the Default font with a monospace editor and sans preview", async () => {
    await browser.pause(1000);
    await setFont("Default");
    expect(await appFont()).toBe("default");
    expect(await editorFont()).toContain("monospace");
    expect(await paneFont("preview-pane")).toContain("sans-serif");
  });

  it("switches to Serif and restyles both panes", async () => {
    await setFont("Serif");
    expect(await appFont()).toBe("serif");
    expect(await editorFont()).toContain("Georgia");
    expect(await paneFont("preview-pane")).toContain("Georgia");
  });

  it("switches to Mono and restyles both panes", async () => {
    await setFont("Mono");
    expect(await appFont()).toBe("mono");
    expect(await editorFont()).toContain("Cascadia Mono");
    expect(await paneFont("preview-pane")).toContain("Cascadia Mono");
  });

  it("persists the chosen font for the next launch", async () => {
    const stored = await browser.execute(() =>
      localStorage.getItem("markdownmagic:settings"),
    );
    expect(stored).toContain("mono");
  });

  it("leaves the app in the Default font for later specs", async () => {
    await setFont("Default");
    expect(await appFont()).toBe("default");
  });
});
