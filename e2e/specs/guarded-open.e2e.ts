import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// A Dirty Document triggers the Confirm-Discard Guard before an Open swap. The
// guard's Save path runs the real save_document write (seeded via localStorage),
// and the Open path runs the real open_document read.
describe("ALi-md-editor guarded Open swap", () => {
  const openPath = path.join(os.tmpdir(), `alimd-e2e-open-${Date.now()}.md`);
  const savePath = path.join(os.tmpdir(), `alimd-e2e-guard-save-${Date.now()}.md`);
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
    try {
      fs.unlinkSync(savePath);
    } catch {
      // already removed
    }
  });

  async function stubOpenDialog() {
    await browser.execute((p) => {
      localStorage.setItem("alimd:e2e:open-path", p);
    }, openPath);
  }

  async function stubSaveDialog() {
    await browser.execute((p) => {
      localStorage.setItem("alimd:e2e:save-path", p);
    }, savePath);
  }

  async function stubGuardChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("alimd:e2e:guard-choice", c);
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

  it("aborts the Open swap when the guard is cancelled, keeping the Document Dirty", async () => {
    await browser.pause(1000);
    await typeText("# Guarded");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md * — ALi-md-editor",
      { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
    );

    await stubGuardChoice("cancel");
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);
    await browser.pause(500);

    expect(await browser.getTitle()).toBe("Untitled.md * — ALi-md-editor");
  });

  it("saves the Dirty Document before opening when Save is chosen", async () => {
    await stubGuardChoice("save");
    await stubSaveDialog();
    await browser.keys(["Control", "o"]);

    const deadline = Date.now() + 10000;
    while (
      Date.now() < deadline &&
      !(fs.existsSync(savePath) && fs.readFileSync(savePath, "utf8") === "# Guarded")
    ) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(fs.existsSync(savePath) ? fs.readFileSync(savePath, "utf8") : null).toBe(
      "# Guarded",
    );

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — ALi-md-editor`,
      { timeout: 10000, timeoutMsg: "Open did not complete after guard save" },
    );

    const editorPane = await $('[data-testid="editor-pane"]');
    await browser.waitUntil(async () => !(await editorPane.isDisplayed()), {
      timeout: 10000,
      timeoutMsg: "Editor Pane stayed visible after the guarded Open",
    });
  });
});
