import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { typeInEditor } from "../helpers/editor";

// The native Confirm-Discard dialog cannot be driven by WebdriverIO, so the E2E
// seeds the app's test seam (enabled by VITE_E2E in the E2E build) with a choice
// via localStorage. The guard logic and the real save_document write still run.
// Because a wdio run launches a single app instance, the E2E build keeps the
// window alive after a Save / Don't Save decision so the suite survives.
describe("Markdown Hexer Confirm-Discard Guard on close", () => {
  const savePath = path.join(os.tmpdir(), `markdownhexer-e2e-guard-${Date.now()}.md`);
  const saveFilename = path.basename(savePath);
  const savedContent = "# Guard cancel\n\n# Guard save";

  after(() => {
    try {
      fs.unlinkSync(savePath);
    } catch {
      // already removed
    }
  });

  async function stubGuardChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("markdownhexer:e2e:guard-choice", c);
    }, choice);
  }

  async function stubSaveDialog() {
    await browser.execute((p) => {
      localStorage.setItem("markdownhexer:e2e:save-path", p);
    }, savePath);
  }

  async function typeText(text: string) {
    await typeInEditor(text);
  }

  async function triggerClose() {
    await browser.execute(() => {
      (window as unknown as { __triggerWindowClose: () => void }).__triggerWindowClose();
    });
  }

  async function waitForFile(assertContent: string) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (fs.existsSync(savePath) && fs.readFileSync(savePath, "utf8") === assertContent) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(fs.readFileSync(savePath, "utf8")).toBe(assertContent);
  }

  it("aborts the close and keeps the Document Dirty when Cancel is chosen", async () => {
    await browser.pause(1000);
    await typeText("# Guard cancel");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md * — Markdown Hexer",
      { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
    );

    await stubGuardChoice("cancel");
    await triggerClose();
    await browser.pause(500);

    expect(await browser.getTitle()).toBe("Untitled.md * — Markdown Hexer");
  });

  it("saves the Document and clears the asterisk when Save is chosen", async () => {
    await typeText("\n\n# Guard save");
    await stubGuardChoice("save");
    await stubSaveDialog();

    await triggerClose();

    await waitForFile(savedContent);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "title did not clear the asterisk after guard save",
      },
    );
  });

  it("discards the close request without writing when Don't Save is chosen", async () => {
    await typeText("\n\n# Guard discard");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} * — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "asterisk did not reappear after typing" },
    );

    await stubGuardChoice("dont-save");
    await triggerClose();
    await browser.pause(500);

    expect(await browser.getTitle()).toBe(`${saveFilename} * — Markdown Hexer`);
    expect(fs.existsSync(savePath) ? fs.readFileSync(savePath, "utf8") : null).toBe(
      savedContent,
    );
  });

  it("runs the Guard when closing a Dirty Tab, keeping it open on Cancel", async () => {
    // A second Tab is opened so closing the Dirty one leaves the app alive;
    // the suite returns to its prior single-Tab state at the end.
    const otherPath = path.join(
      os.tmpdir(),
      `markdownhexer-e2e-guard-tab-${Date.now()}.md`,
    );
    const otherFilename = path.basename(otherPath);
    fs.writeFileSync(otherPath, "# Other file");
    try {
      await browser.execute((p) => {
        (
          window as unknown as {
            __triggerFileOpen: (path: string) => void;
          }
        ).__triggerFileOpen(p);
      }, otherPath);
      await browser.waitUntil(
        async () => (await browser.getTitle()) === `${otherFilename} — Markdown Hexer`,
        { timeout: 10000, timeoutMsg: "file-open did not add the second Tab" },
      );

      // An opened Tab starts in Preview Only; switch to Split so typing lands.
      await $('[data-testid="layout-split"]').click();
      await typeText("# Dirty close");
      await browser.waitUntil(
        async () =>
          (await browser.getTitle()) === `${otherFilename} * — Markdown Hexer`,
        { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
      );

      await stubGuardChoice("cancel");
      await $$('[data-testid="tab-close"]')[1].click();
      await browser.pause(500);

      // Cancel keeps the Dirty Tab open.
      const afterCancel = await $$('[data-testid="tab"]');
      expect(afterCancel.length).toBe(2);
      expect(await browser.getTitle()).toBe(`${otherFilename} * — Markdown Hexer`);

      // Don't Save closes the Tab; the app returns to its prior single Tab.
      await stubGuardChoice("dont-save");
      await $$('[data-testid="tab-close"]')[1].click();
      await browser.pause(500);

      const afterClose = await $$('[data-testid="tab"]');
      expect(afterClose.length).toBe(1);
      expect(await browser.getTitle()).toBe(`${saveFilename} * — Markdown Hexer`);
    } finally {
      try {
        fs.unlinkSync(otherPath);
      } catch {
        // already removed
      }
    }
  });
});
