// Theme: a seven-state preference (System plus six Palettes) driven through the
// toolbar. System is the default and resolves to the Light or Dark Palette via
// matchMedia, so `data-theme` always carries a Palette — never "system". The
// E2E switches themes and asserts `data-theme` plus the pane styling actually
// change.
describe("Markdown Hexer theme", () => {
  const THEME_VALUES: Record<string, string> = {
    System: "system",
    Light: "light",
    House: "house",
    Dark: "dark",
    "High Contrast": "high-contrast",
    Nord: "nord",
    "Terminal Green": "terminal-green",
  };

  async function appTheme(): Promise<string | null> {
    return $('[data-testid="app"]').getAttribute("data-theme");
  }

  async function appBackground(): Promise<string> {
    const app = await $('[data-testid="app"]');
    return browser.execute((el) => getComputedStyle(el).backgroundColor, app);
  }

  async function appTextColor(): Promise<string> {
    const app = await $('[data-testid="app"]');
    return browser.execute((el) => getComputedStyle(el).color, app);
  }

  async function storedTheme(): Promise<string | null> {
    return browser.execute(() => {
      const raw = localStorage.getItem("markdownhexer:settings");
      if (raw === null) {
        return null;
      }
      const parsed = JSON.parse(raw) as { theme?: string };
      return parsed.theme ?? null;
    });
  }

  async function setTheme(label: string) {
    const select = await $('[data-testid="toolbar-theme"]');
    await select.selectByVisibleText(label);
    await browser.waitUntil(
      async () => (await storedTheme()) === THEME_VALUES[label],
      {
        timeout: 10000,
        timeoutMsg: `theme did not switch to "${label}"`,
      },
    );
  }

  it("starts from System and keys all styling off the resolved Palette", async () => {
    await browser.pause(1000);
    // A fresh launch either persists nothing or the default; System is the
    // default preference either way.
    expect(["system", null]).toContain(await storedTheme());
    expect(await appTheme()).not.toBe("system");
  });

  it("switches to Light and restyles the panes", async () => {
    await setTheme("Light");
    expect(await appTheme()).toBe("light");
    // The warm beige background and dark brown text must reach the DOM.
    expect(await appBackground()).toBe("rgb(245, 241, 227)");
    expect(await appTextColor()).toBe("rgb(63, 50, 34)");
  });

  it("switches to House and restyles the panes", async () => {
    await setTheme("House");
    expect(await appTheme()).toBe("house");
    expect(await appBackground()).toBe("rgb(247, 246, 240)");
    expect(await appTextColor()).toBe("rgb(38, 48, 42)");
  });

  it("switches to Dark and restyles the panes", async () => {
    await setTheme("Dark");
    expect(await appTheme()).toBe("dark");
    expect(await appBackground()).toBe("rgb(15, 24, 38)");
  });

  it("switches to High Contrast and restyles the panes", async () => {
    await setTheme("High Contrast");
    expect(await appTheme()).toBe("high-contrast");
    expect(await appBackground()).toBe("rgb(0, 0, 0)");
    expect(await appTextColor()).toBe("rgb(255, 255, 255)");
  });

  it("switches to Nord and restyles the panes", async () => {
    await setTheme("Nord");
    expect(await appTheme()).toBe("nord");
    expect(await appBackground()).toBe("rgb(46, 52, 64)");
  });

  it("switches to Terminal Green and restyles the panes", async () => {
    await setTheme("Terminal Green");
    expect(await appTheme()).toBe("terminal-green");
    expect(await appBackground()).toBe("rgb(10, 10, 10)");
  });

  it("persists the manual override for the next launch", async () => {
    await setTheme("Terminal Green");
    expect(await storedTheme()).toBe("terminal-green");
  });

  it("leaves the app in the System default for later specs", async () => {
    await setTheme("System");
    expect(await storedTheme()).toBe("system");
  });
});
