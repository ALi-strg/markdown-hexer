import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// The native Open dialog cannot be driven by WebdriverIO, so the E2E seeds the
// app's test seam (enabled by VITE_E2E in the E2E build) with a real temp path
// via localStorage. The read still runs through the real open_document command.
// New and Open add Tabs: they never replace a Document and never run the
// Confirm-Discard Guard.
describe("Markdown Hexer New & Open flows", () => {
  const openPath = path.join(os.tmpdir(), `markdownhexer-e2e-open-${Date.now()}.md`);
  const openFilename = path.basename(openPath);

  before(() => {
    fs.writeFileSync(openPath, "# Opened file");
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

  async function typeText(text: string) {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue(text);
  }

  it("adds a numbered Untitled Tab in Split View on Cmd/Ctrl+N", async () => {
    await browser.pause(1000);
    await typeText("# Draft");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md * — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
    );

    // New adds a Tab; it never discards the Dirty launch Document.
    await browser.keys(["Control", "n"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled 2.md — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "New did not create Untitled 2.md" },
    );

    const editorPane = await $('[data-testid="editor-pane"]');
    const previewPane = await $('[data-testid="preview-pane"]');
    expect(await editorPane.isDisplayed()).toBe(true);
    expect(await previewPane.isDisplayed()).toBe(true);

    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    expect(await editorContent.getText()).not.toContain("# Draft");

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(2);
    // WebKitGTK's getElementText drops the ellipsized tab label, so read the
    // accessible label (the same text the visible label renders) instead.
    expect(await tabs[1].getAttribute("aria-label")).toContain("Untitled 2.md");
  });

  it("opens a file into a new Tab in Preview Only on Cmd/Ctrl+O", async () => {
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "title did not update to the opened filename",
      },
    );

    const editorPane = await $('[data-testid="editor-pane"]');
    await browser.waitUntil(async () => !(await editorPane.isDisplayed()), {
      timeout: 10000,
      timeoutMsg: "Editor Pane stayed visible after Open (expected Preview Only)",
    });

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes("Opened file"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the opened content",
      },
    );

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
    expect(await tabs[2].getAttribute("aria-label")).toContain(openFilename);
  });
});
