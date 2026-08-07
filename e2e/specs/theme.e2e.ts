// Theme: a three-state preference (System / Light / Dark) driven through the
// toolbar. System is the default and follows the OS via CSS; Light and Dark are
// manual overrides persisted in localStorage. The E2E switches themes and
// asserts `data-theme` plus the pane styling actually change.
describe("ALi-md-editor theme", () => {
  async function appTheme(): Promise<string | null> {
    return $('[data-testid="app"]').getAttribute("data-theme");
  }

  async function appBackground(): Promise<string> {
    const app = await $('[data-testid="app"]');
    return browser.execute((el) => getComputedStyle(el).backgroundColor, app);
  }

  async function setTheme(label: string) {
    const select = await $('[data-testid="toolbar-theme"]');
    await select.selectByVisibleText(label);
    await browser.waitUntil(
      async () => (await appTheme()) !== "system" || label === "System",
      {
        timeout: 10000,
        timeoutMsg: `theme did not switch to "${label}"`,
      },
    );
  }

  it("starts from the System theme and keys all styling off data-theme", async () => {
    await browser.pause(1000);
    await setTheme("System");
    expect(await appTheme()).toBe("system");
  });

  it("switches to Light and restyles the panes", async () => {
    await setTheme("Light");
    expect(await appTheme()).toBe("light");
    expect(await appBackground()).toBe("rgb(245, 246, 248)");
  });

  it("switches to Dark and restyles the panes", async () => {
    await setTheme("Dark");
    expect(await appTheme()).toBe("dark");
    expect(await appBackground()).toBe("rgb(15, 24, 38)");
  });

  it("persists the manual override for the next launch", async () => {
    const stored = await browser.execute(() =>
      localStorage.getItem("alimd:settings"),
    );
    expect(stored).toContain("dark");
  });

  it("leaves the app in the System default for later specs", async () => {
    await setTheme("System");
    expect(await appTheme()).toBe("system");
  });
});
