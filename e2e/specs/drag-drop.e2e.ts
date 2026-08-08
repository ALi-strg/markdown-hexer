import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// A real OS file drag onto the native window cannot be driven by WebdriverIO,
// so the E2E triggers the app's drop seam (enabled by VITE_E2E in the E2E
// build) with a real temp path. The seam runs the same runDropOpen code path a
// real drop uses: Confirm-Discard Guard, then the real open_document read, then
// the auto-chosen Preview Only layout.
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

  async function stubGuardChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("markdownmagic:e2e:guard-choice", c);
    }, choice);
  }

  async function typeText(text: string) {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
    await editorContent.addValue(text);
  }

  it("opens a dropped file into the Document in Preview Only", async () => {
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
  });

  it("runs the Confirm-Discard Guard and keeps the Document when a drop is cancelled", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await typeText("# Local edits");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${dropAFilename} * — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await stubGuardChoice("cancel");
    await triggerDrop(dropBPath);
    await browser.pause(500);

    expect(await browser.getTitle()).toBe(`${dropAFilename} * — Markdown-Magic`);
  });

  it("swaps the Dirty Document on a drop when the guard is dismissed", async () => {
    await stubGuardChoice("dont-save");
    await triggerDrop(dropBPath);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${dropBFilename} — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "drop did not swap after the guard" },
    );

    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await browser.waitUntil(
      async () => (await editorContent.getText()).includes("Dropped B"),
      {
        timeout: 10000,
        timeoutMsg: "Editor Pane did not load the dropped content",
      },
    );

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes("Dropped B"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the swapped content",
      },
    );
  });
});
