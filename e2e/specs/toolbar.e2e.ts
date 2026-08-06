import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Formatting is driven through real CodeMirror transactions, so the E2E
// exercises the full path: toolbar clicks and Cmd/Ctrl shortcuts apply through
// the editor, and Cmd/Ctrl+Z reverts them via the normal undo history.
describe("ALi-md-editor toolbar formatting & shortcuts", () => {
  const openPath = path.join(
    os.tmpdir(),
    `alimd-e2e-toolbar-${Date.now()}.md`,
  );
  const openFilename = path.basename(openPath);

  before(() => {
    fs.writeFileSync(openPath, "# Opened");
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
      localStorage.setItem("alimd:e2e:open-path", p);
    }, openPath);
  }

  async function focusEditor() {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await editorContent.click();
  }

  async function editorText() {
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    return editorContent.getText();
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

  it("disables the formatting toolbar in Preview Only", async () => {
    await browser.pause(1000);
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — ALi-md-editor`,
      { timeout: 10000, timeoutMsg: "Open did not load the file" },
    );

    const bold = await $('[data-testid="toolbar-bold"]');
    expect(await bold.isEnabled()).toBe(false);
  });

  it("enables the toolbar in a source-visible mode and applies bold via the Cmd/Ctrl+B shortcut", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    const bold = await $('[data-testid="toolbar-bold"]');
    expect(await bold.isEnabled()).toBe(true);

    await focusEditor();
    await browser.keys(["Control", "a"]);
    await browser.keys(["Control", "b"]);

    await waitForEditorText("**# Opened**");

    await browser.keys(["Control", "z"]);
    await waitForEditorText("# Opened");
  });

  it("applies italic via the Cmd/Ctrl+I shortcut and undoes it", async () => {
    await focusEditor();
    await browser.keys(["Control", "a"]);
    await browser.keys(["Control", "i"]);

    await waitForEditorText("*# Opened*");

    await browser.keys(["Control", "z"]);
    await waitForEditorText("# Opened");
  });

  it("wraps the selection in bold via the toolbar button", async () => {
    await focusEditor();
    await browser.keys(["Control", "a"]);
    await (await $('[data-testid="toolbar-bold"]')).click();

    await waitForEditorText("**# Opened**");
  });
});
