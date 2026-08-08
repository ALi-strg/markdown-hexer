import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { typeInEditor } from "../helpers/editor";

// The native Confirm-Discard dialog cannot be driven by WebdriverIO, so the E2E
// seeds the app's test seam (enabled by VITE_E2E in the E2E build) with a choice
// via localStorage. The guard logic and the real save_document write still run.
// Because a wdio run launches a single app instance, the E2E build keeps the
// window alive after a Save / Don't Save decision so the suite survives.
describe("Markdown-Magic Confirm-Discard Guard on close", () => {
  const savePath = path.join(os.tmpdir(), `markdownmagic-e2e-guard-${Date.now()}.md`);
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
      localStorage.setItem("markdownmagic:e2e:guard-choice", c);
    }, choice);
  }

  async function stubSaveDialog() {
    await browser.execute((p) => {
      localStorage.setItem("markdownmagic:e2e:save-path", p);
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
        (await browser.getTitle()) === "Untitled.md * — Markdown-Magic",
      { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
    );

    await stubGuardChoice("cancel");
    await triggerClose();
    await browser.pause(500);

    expect(await browser.getTitle()).toBe("Untitled.md * — Markdown-Magic");
  });

  it("saves the Document and clears the asterisk when Save is chosen", async () => {
    await typeText("\n\n# Guard save");
    await stubGuardChoice("save");
    await stubSaveDialog();

    await triggerClose();

    await waitForFile(savedContent);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} — Markdown-Magic`,
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
        (await browser.getTitle()) === `${saveFilename} * — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "asterisk did not reappear after typing" },
    );

    await stubGuardChoice("dont-save");
    await triggerClose();
    await browser.pause(500);

    expect(await browser.getTitle()).toBe(`${saveFilename} * — Markdown-Magic`);
    expect(fs.existsSync(savePath) ? fs.readFileSync(savePath, "utf8") : null).toBe(
      savedContent,
    );
  });
});
