import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// A real OS file drag onto the native window cannot be driven by WebdriverIO,
// so the E2E triggers the app's drop seam (enabled by VITE_E2E in the E2E
// build) with a real temp path. The seam runs the same openPath code path a
// real drop uses: no Confirm-Discard Guard, an add-or-focus Tab, and the
// auto-chosen Preview Only layout for a new Tab.
describe("Markdown-Magic drag-and-drop open", () => {
  const dropAPath = path.join(
    os.tmpdir(),
    `markdownmagic-e2e-drop-a-${Date.now()}.md`,
  );
  const dropBPath = path.join(
    os.tmpdir(),
    `markdownmagic-e2e-drop-b-${Date.now()}.md`,
  );
  const dropAFilename = path.basename(dropAPath);
  const dropBFilename = path.basename(dropBPath);

  before(() => {
    fs.writeFileSync(dropAPath, "# Dropped A");
    fs.writeFileSync(dropBPath, "# Dropped B");
  });

  after(() => {
    try {
      fs.unlinkSync(dropAPath);
    } catch {
      // already removed
    }
    try {
      fs.unlinkSync(dropBPath);
    } catch {
      // already removed
    }
  });

  async function triggerDrop(filePath: string) {
    await browser.execute((p) => {
      (window as unknown as { __triggerDrop: (path: string) => void }).__triggerDrop(p);
    }, filePath);
  }

  async function typeText(text: string) {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue(text);
  }

  it("opens a dropped file into a new Tab in Preview Only", async () => {
    await browser.pause(1000);
    await triggerDrop(dropAPath);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${dropAFilename} — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "drop did not update the title" },
    );

    const editorPane = await $('[data-testid="editor-pane"]');
    await browser.waitUntil(async () => !(await editorPane.isDisplayed()), {
      timeout: 10000,
      timeoutMsg: "Editor Pane stayed visible after drop (expected Preview Only)",
    });

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes("Dropped A"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the dropped content",
      },
    );

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(2);
    // WebKitGTK's getElementText drops the ellipsized tab label, so read the
    // accessible label (the same text the visible label renders) instead.
    expect(await tabs[1].getAttribute("aria-label")).toContain(dropAFilename);
  });

  it("opens a drop onto a Dirty Document without the Confirm-Discard Guard", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    await typeText("# Local edits");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${dropAFilename} * — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await triggerDrop(dropBPath);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${dropBFilename} — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "drop did not open a new Tab" },
    );

    // The Dirty Document is still open in its own Tab.
    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
    expect(await tabs[1].getText()).toContain("*");
  });

  it("focuses the existing Tab when the same path is dropped again", async () => {
    await triggerDrop(dropBPath);
    await browser.pause(500);

    const tabs = await $$('[data-testid="tab"]');
    expect(tabs.length).toBe(3);
    expect(await browser.getTitle()).toBe(`${dropBFilename} — Markdown-Magic`);
  });
});
