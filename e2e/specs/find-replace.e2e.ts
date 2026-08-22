import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Find & replace runs through @codemirror/search driven by the app's find
// overlay, so the E2E exercises the real path: Preview Only hides the Editor
// Pane, so Cmd/Ctrl+F there first switches the Document to Split View (the
// source must be visible for highlights and scroll-to-match); matches are then
// navigable and replaced in place.
describe("Markdown Hexer find & replace", () => {
  const openPath = path.join(
    os.tmpdir(),
    `markdownhexer-e2e-find-${Date.now()}.md`,
  );
  const openFilename = path.basename(openPath);
  const original = "alpha beta alpha\ngamma alpha";
  const replacedOnce = "ALPHA beta alpha\ngamma alpha";
  const replacedAll = "ALPHA beta ALPHA\ngamma ALPHA";

  before(() => {
    fs.writeFileSync(openPath, original);
  });

  after(() => {
    try {
      fs.unlinkSync(openPath);
    } catch {
      // already removed
    }
  });

  async function stubOpenDialog() {
    await browser.execute((p) => {
      localStorage.setItem("markdownhexer:e2e:open-path", p);
    }, openPath);
  }

  async function openFileInPreviewOnly() {
    await browser.pause(1000);
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "Open did not load the file" },
    );
  }

  async function openFindOverlay() {
    await browser.keys(["Control", "f"]);
    const panel = await $('[data-testid="find-panel"]');
    await panel.waitForDisplayed({ timeout: 10000 });
  }

  async function matchCount() {
    return $('[data-testid="match-count"]').getText();
  }

  async function waitForMatchCount(text: string) {
    await browser.waitUntil(
      async () => (await matchCount()) === text,
      {
        timeout: 10000,
        timeoutMsg: `match count did not reach "${text}"`,
      },
    );
  }

  async function editorText() {
    // Read through execute + innerText: WebDriver's getText on a freshly
    // revealed Editor Pane can hang, and textContent would drop line breaks.
    // WebKitGTK's innerText also appends a trailing newline for the final line
    // (WebView2 does not), so strip it before comparing against expectations.
    return browser.execute(
      () =>
        (document.querySelector(
          '[data-testid="editor-pane"] .cm-content',
        ) as HTMLElement | null)?.innerText.replace(/\n+$/, "") ?? "",
    );
  }

  async function waitForEditorText(text: string) {
    await browser.waitUntil(
      async () => (await editorText()) === text,
      {
        timeout: 10000,
        timeoutMsg: `editor did not reach "${text}"`,
      },
    );
  }

  it("opens find in Preview Only by switching to Split View", async () => {
    await openFileInPreviewOnly();

    const editorPane = await $('[data-testid="editor-pane"]');
    expect(await editorPane.isDisplayed()).toBe(false);

    await openFindOverlay();
    expect(await editorPane.isDisplayed()).toBe(true);

    const input = await $('[data-testid="find-input"]');
    await input.click();
    await browser.keys("alpha");
    await waitForMatchCount("1 / 3");
    expect(await editorPane.isDisplayed()).toBe(true);
  });

  it("navigates matches with next and previous while finding continues", async () => {
    const input = await $('[data-testid="find-input"]');
    await input.click();
    await browser.keys("Enter");
    await waitForMatchCount("2 / 3");

    await browser.keys(["Shift", "Enter"]);
    await waitForMatchCount("1 / 3");
  });

  it("switches to Split View and replaces in place when replacing in Preview Only", async () => {
    const editorPane = await $('[data-testid="editor-pane"]');
    const replaceInput = await $('[data-testid="replace-input"]');
    await replaceInput.click();
    await browser.keys("ALPHA");

    await (await $('[data-testid="replace-next"]')).click();

    await editorPane.waitForDisplayed({ timeout: 10000 });
    await waitForEditorText(replacedOnce);
  });

  it("replaces the remaining matches in place in Split View", async () => {
    const editorPane = await $('[data-testid="editor-pane"]');
    await (await $('[data-testid="replace-all"]')).click();

    await waitForEditorText(replacedAll);
    expect(await editorPane.isDisplayed()).toBe(true);
  });
});
