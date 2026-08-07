import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { typeInEditor } from "../helpers/editor";

describe("ALi-md-editor save / save as", () => {
  const savePath = path.join(os.tmpdir(), `alimd-e2e-${Date.now()}.md`);
  const saveFilename = path.basename(savePath);

  after(() => {
    try {
      fs.unlinkSync(savePath);
    } catch {
      // already removed
    }
  });

  // The native Save As dialog cannot be driven by WebdriverIO, so the E2E
  // seeds the app's test seam (enabled by VITE_E2E in the E2E build) with a
  // real temp path via localStorage. The write itself still runs through the
  // real save_document command.
  async function stubSaveDialog() {
    await browser.execute((stubPath) => {
      localStorage.setItem("alimd:e2e:save-path", stubPath);
    }, savePath);
  }

  async function typeText(text: string) {
    await typeInEditor(text);
  }

  it("saves an Untitled Document to a picked path and clears the asterisk", async () => {
    await browser.pause(1000);
    await stubSaveDialog();
    await typeText("# E2E save");

    await browser.keys(["Control", "s"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} — ALi-md-editor`,
      {
        timeout: 10000,
        timeoutMsg: "title did not update to the saved filename",
      },
    );

    expect(fs.readFileSync(savePath, "utf8")).toBe("# E2E save");
  });

  it("writes later changes to the canonical path on Cmd/Ctrl+S", async () => {
    await typeText("\n\nMore content");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} * — ALi-md-editor`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await browser.keys(["Control", "s"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${saveFilename} — ALi-md-editor`,
      {
        timeout: 10000,
        timeoutMsg: "asterisk did not clear after save",
      },
    );

    expect(fs.readFileSync(savePath, "utf8")).toBe(
      "# E2E save\n\nMore content",
    );
  });
});
