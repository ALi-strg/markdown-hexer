import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// The Tab Bar is chrome, so a WebdriverIO spec can drive it directly: the
// window title follows the Active Tab, a + creates a numbered Untitled Tab,
// and an OS file-open of a new path adds a Tab while a repeat open of an
// already-open path focuses the existing Tab (one Tab per path).
describe("Markdown Hexer Tab Bar", () => {
  const firstPath = path.join(
    os.tmpdir(),
    `markdownhexer-e2e-tabs-a-${Date.now()}.md`,
  );
  const firstFilename = path.basename(firstPath);

  before(() => {
    fs.writeFileSync(firstPath, "# Tab A content");
  });

  after(() => {
    try {
      fs.unlinkSync(firstPath);
    } catch {
      // already removed
    }
  });

  async function triggerFileOpen(filePath: string) {
    await browser.execute((p) => {
      (
        window as unknown as {
          __triggerFileOpen: (path: string) => void;
        }
      ).__triggerFileOpen(p);
    }, filePath);
  }

  it("renders the launch Tab and creates a numbered Untitled Tab via +", async () => {
    await browser.pause(1000);
    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(1);
    // Read the accessible label rather than getText(): WebKitGTK's getElementText
    // excludes the ellipsized .tab-label span, so getText() comes back empty.
    expect(await tabs[0].getAttribute("aria-label")).toContain("Untitled.md");

    await $('[data-testid="tab-new"]').click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled 2.md — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "+ did not create and activate Untitled 2.md" },
    );

    const after = await $$('[data-testid="tab"]');
    expect(after.length).toBe(2);
    expect(await after[1].getAttribute("aria-label")).toContain("Untitled 2.md");
  });

  it("opens a file into a new Tab via OS file-open", async () => {
    await triggerFileOpen(firstPath);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${firstFilename} — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "file-open did not add a Tab" },
    );

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
  });

  it("focuses the existing Tab when the same path is opened again", async () => {
    await triggerFileOpen(firstPath);
    await browser.pause(500);

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
    expect(await browser.getTitle()).toBe(`${firstFilename} — Markdown Hexer`);
  });

  it("switches Tabs by click, following the window title", async () => {
    const tabs = await $$('[data-testid="tab"]');
    await tabs[0].click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "clicking a Tab did not activate it" },
    );
  });

  it("activates the Tab to the right when the Active Tab closes", async () => {
    // [Untitled.md, Untitled 2.md, a.md] — activate the middle Tab and close
    // it; the Tab to its right takes its place.
    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
    await tabs[1].click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled 2.md — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "clicking the middle Tab did not activate it" },
    );

    await $$('[data-testid="tab-close"]')[1].click();

    await browser.waitUntil(
      async () => (await browser.getTitle()) === `${firstFilename} — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "closing the Active Tab did not activate its right neighbour" },
    );
    expect(await $$('[data-testid="tab"]')).toHaveLength(2);
  });

  it("closes a background Tab without touching the Active Tab", async () => {
    // [Untitled.md, a.md], a.md Active — closing the launch Tab changes nothing.
    const activeTitle = await browser.getTitle();
    await $$('[data-testid="tab-close"]')[0].click();
    await browser.pause(400);

    expect(await $$('[data-testid="tab"]')).toHaveLength(1);
    expect(await browser.getTitle()).toBe(activeTitle);
  });
});
