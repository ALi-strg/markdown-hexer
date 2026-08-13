import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { typeInEditor } from "../helpers/editor";

// The native Externally-Modified dialog cannot be driven by WebdriverIO, so the
// E2E seeds the app's test seam (enabled by VITE_E2E in the E2E build) with a
// choice via localStorage. The detection itself runs for real: the file is
// rewritten on disk by the test, and the app compares it through the real
// inspect_document command. The check is triggered through the __triggerExternalCheck
// seam (real window-focus events are not reliably observable under the driver).
describe("Markdown Hexer Externally-Modified detection", () => {
  const externalPath = path.join(
    os.tmpdir(),
    `markdownhexer-e2e-external-${Date.now()}.md`,
  );
  const externalFilename = path.basename(externalPath);

  before(() => {
    fs.writeFileSync(externalPath, "# Original");
  });

  after(() => {
    try {
      fs.unlinkSync(externalPath);
    } catch {
      // already removed
    }
  });

  async function stubOpenDialog() {
    await browser.execute((p) => {
      localStorage.setItem("markdownhexer:e2e:open-path", p);
    }, externalPath);
  }

  async function stubExternalChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("markdownhexer:e2e:external-choice", c);
    }, choice);
  }

  async function triggerExternalCheck() {
    await browser.execute(() => {
      (window as unknown as { __triggerExternalCheck: () => void }).__triggerExternalCheck();
    });
  }

  async function changeFileOnDisk(content: string) {
    fs.writeFileSync(externalPath, content);
  }

  async function typeText(text: string) {
    await typeInEditor(text);
  }

  async function waitForPreviewToContain(text: string) {
    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes(text),
      {
        timeout: 10000,
        timeoutMsg: `Preview Pane did not show "${text}"`,
      },
    );
  }

  it("silently reloads a clean Document whose file changed on disk", async () => {
    await browser.pause(1000);
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "Open did not load the external file" },
    );
    await waitForPreviewToContain("Original");

    await changeFileOnDisk("# Changed on disk");
    await triggerExternalCheck();

    await waitForPreviewToContain("Changed on disk");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "silent reload left the Document Dirty or changed the title",
      },
    );
  });

  it("reloads a Dirty Document from disk when Reload is chosen", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await typeText("\n\n# Local edits");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} * — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await changeFileOnDisk("# External version");
    await stubExternalChoice("reload");
    await triggerExternalCheck();

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "asterisk did not clear after Reload",
      },
    );
    await waitForPreviewToContain("External version");
  });

  it("overwrites the disk and stays Dirty when Overwrite is chosen", async () => {
    await typeText("\n\n# Local keep");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} * — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );
    const localContent = fs.readFileSync(externalPath, "utf8") + "\n\n# Local keep";

    await changeFileOnDisk("# Somebody else");
    await stubExternalChoice("overwrite");
    await triggerExternalCheck();

    await browser.waitUntil(
      () =>
        fs.existsSync(externalPath) &&
        fs.readFileSync(externalPath, "utf8") === localContent,
      {
        timeout: 10000,
        timeoutMsg: "Overwrite did not write the local content to disk",
      },
    );
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} * — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "Document should stay Dirty until saved after Overwrite",
      },
    );

    await browser.keys(["Control", "s"]);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "Save after Overwrite did not clear the asterisk",
      },
    );
    expect(fs.readFileSync(externalPath, "utf8")).toBe(localContent);
  });

  it("keeps the current state when Cancel is chosen", async () => {
    await typeText("\n\n# Keep me");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} * — Markdown Hexer`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await changeFileOnDisk("# Cancel target");
    await stubExternalChoice("cancel");
    await triggerExternalCheck();

    await browser.pause(500);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${externalFilename} * — Markdown Hexer`,
      {
        timeout: 10000,
        timeoutMsg: "Cancel should keep the Document Dirty",
      },
    );
    expect(fs.readFileSync(externalPath, "utf8")).toBe("# Cancel target");
    expect(fs.readFileSync(externalPath, "utf8")).not.toContain("# Keep me");
  });
});
