import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { typeInEditor } from "../helpers/editor";

// The Document Controls group (New, Open, Save, Save As, Find & Replace) and
// Undo/Redo are driven through the same guarded flows as the shortcuts. Native
// dialogs are stubbed via the VITE_E2E localStorage seam; the writes/reads still
// run through the real save_document/open_document commands.
describe("ALi-md-editor Document Controls & Undo/Redo", () => {
  const savePath = path.join(
    os.tmpdir(),
    `alimd-e2e-doc-controls-${Date.now()}.md`,
  );
  const saveAsPath = path.join(
    os.tmpdir(),
    `alimd-e2e-doc-controls-as-${Date.now()}.md`,
  );
  const openPath = path.join(
    os.tmpdir(),
    `alimd-e2e-doc-controls-open-${Date.now()}.md`,
  );
  const saveFilename = path.basename(savePath);

  before(() => {
    fs.writeFileSync(openPath, "# Opened via button");
  });

  after(() => {
    for (const p of [savePath, saveAsPath, openPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        // already removed
      }
    }
  });

  async function stubSaveDialog(p: string) {
    await browser.execute((stubPath) => {
      localStorage.setItem("alimd:e2e:save-path", stubPath);
    }, p);
  }

  async function stubOpenDialog() {
    await browser.execute((p) => {
      localStorage.setItem("alimd:e2e:open-path", p);
    }, openPath);
  }

  async function stubGuardChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("alimd:e2e:guard-choice", c);
    }, choice);
  }

  async function editorText() {
    return browser.execute(
      () =>
        (
          document.querySelector(
            '[data-testid="editor-pane"] .cm-content',
          ) as HTMLElement | null
        )?.innerText.replace(/\n+$/, "") ?? "",
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

  it("starts from a fresh Document via the New button", async () => {
    await browser.pause(1000);
    await stubGuardChoice("dont-save");
    await (await $('[data-testid="toolbar-new"]')).click();
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md — ALi-md-editor",
      {
        timeout: 10000,
        timeoutMsg: "New button did not create an Untitled Document",
      },
    );
    expect(await (await $('[data-testid="editor-pane"]')).isDisplayed()).toBe(
      true,
    );
  });

  it("saves an Untitled Document through the Save button as Save As", async () => {
    await typeInEditor("# Saved via button");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === "Untitled.md * — ALi-md-editor",
      { timeout: 10000, timeoutMsg: "asterisk did not appear after typing" },
    );

    await stubSaveDialog(savePath);
    await (await $('[data-testid="toolbar-save"]')).click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} — ALi-md-editor`,
      {
        timeout: 10000,
        timeoutMsg: "Save button did not write the Document",
      },
    );
    expect(fs.readFileSync(savePath, "utf8")).toBe("# Saved via button");
  });

  it("writes the Document to a new path through the Save As button", async () => {
    const saveAsFilename = path.basename(saveAsPath);
    await stubSaveDialog(saveAsPath);
    await (await $('[data-testid="toolbar-save-as"]')).click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveAsFilename} — ALi-md-editor`,
      {
        timeout: 10000,
        timeoutMsg: "Save As button did not write to the new path",
      },
    );
    expect(fs.readFileSync(saveAsPath, "utf8")).toBe("# Saved via button");
  });

  it("undoes and redoes through the toolbar buttons", async () => {
    await (await $('[data-testid="toolbar-undo"]')).click();
    await waitForEditorText("");
    const redoBtn = await $('[data-testid="toolbar-redo"]');
    expect(await redoBtn.isEnabled()).toBe(true);

    await redoBtn.click();
    await waitForEditorText("# Saved via button");
    expect(
      await (await $('[data-testid="toolbar-undo"]')).isEnabled(),
    ).toBe(true);
  });

  it("shows only Theme, Font, and the Layout Switcher in Preview Only", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    await browser.waitUntil(
      async () =>
        !(await (await $('[data-testid="toolbar-new"]')).isDisplayed()),
      {
        timeout: 10000,
        timeoutMsg: "Document Controls stayed visible in Preview Only",
      },
    );

    for (const id of [
      "toolbar-new",
      "toolbar-open",
      "toolbar-save",
      "toolbar-save-as",
      "toolbar-find",
      "toolbar-undo",
      "toolbar-redo",
    ]) {
      expect(await (await $(`[data-testid="${id}"]`)).isDisplayed()).toBe(
        false,
      );
    }
    expect(
      await (await $('[data-testid="toolbar-theme"]')).isDisplayed(),
    ).toBe(true);
    expect(
      await (await $('[data-testid="toolbar-font"]')).isDisplayed(),
    ).toBe(true);
    expect(
      await (await $('[data-testid="layout-switcher"]')).isDisplayed(),
    ).toBe(true);
  });

  it("keeps the Document Controls visible in Focus Mode", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    await browser.waitUntil(
      async () =>
        (await (await $('[data-testid="toolbar-new"]')).isDisplayed()) &&
        !(await (await $('[data-testid="preview-pane"]')).isDisplayed()),
      {
        timeout: 10000,
        timeoutMsg: "Focus Mode did not show the Document Controls",
      },
    );

    for (const id of [
      "toolbar-new",
      "toolbar-open",
      "toolbar-save",
      "toolbar-save-as",
      "toolbar-find",
      "toolbar-undo",
      "toolbar-redo",
    ]) {
      expect(await (await $(`[data-testid="${id}"]`)).isDisplayed()).toBe(true);
    }
    expect(
      await (await $('[data-testid="toolbar-theme"]')).isDisplayed(),
    ).toBe(true);
    expect(
      await (await $('[data-testid="layout-switcher"]')).isDisplayed(),
    ).toBe(true);
  });

  it("opens the Find & Replace panel via its toolbar button", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    await browser.waitUntil(
      async () =>
        (await (await $('[data-testid="preview-pane"]')).isDisplayed()) &&
        (await (await $('[data-testid="editor-pane"]')).isDisplayed()),
      {
        timeout: 10000,
        timeoutMsg: "did not return to Split View",
      },
    );

    await (await $('[data-testid="toolbar-find"]')).click();
    const panel = await $('[data-testid="find-panel"]');
    await panel.waitForDisplayed({ timeout: 10000 });
    await (await $('[data-testid="find-close"]')).click();
  });

  it("opens a picked file through the Open button", async () => {
    const openFilename = path.basename(openPath);
    await stubOpenDialog();
    await (await $('[data-testid="toolbar-open"]')).click();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — ALi-md-editor`,
      {
        timeout: 10000,
        timeoutMsg: "Open button did not load the picked file",
      },
    );
    await waitForEditorText("# Opened via button");
  });

  it("shows every Document Control and Undo/Redo shortcut in its tooltip", async () => {
    const expectations: Array<[string, string]> = [
      ["toolbar-new", "New (Ctrl/Cmd+N)"],
      ["toolbar-open", "Open (Ctrl/Cmd+O)"],
      ["toolbar-save", "Save (Ctrl/Cmd+S)"],
      ["toolbar-save-as", "Save As (Ctrl/Cmd+Shift+S)"],
      ["toolbar-find", "Find & Replace (Ctrl/Cmd+F)"],
      ["toolbar-undo", "Undo (Ctrl/Cmd+Z)"],
      ["toolbar-redo", "Redo (Ctrl/Cmd+Shift+Z)"],
    ];
    for (const [id, title] of expectations) {
      expect(
        await (await $(`[data-testid="${id}"]`)).getAttribute("title"),
      ).toBe(title);
    }
  });
});
