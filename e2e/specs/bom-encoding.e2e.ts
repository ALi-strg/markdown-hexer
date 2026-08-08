import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// UTF-8 encoding: a leading BOM is stripped on read and saved files are clean
// UTF-8 without a BOM. The E2E writes a BOM-prefixed fixture, opens it through
// the real open_document command, verifies the rendered content, then saves
// through the real save_document command and asserts the on-disk bytes carry
// no BOM.
describe("Markdown-Magic BOM / UTF-8 encoding", () => {
  const openPath = path.join(os.tmpdir(), `markdownmagic-e2e-bom-${Date.now()}.md`);
  const openFilename = path.basename(openPath);

  before(() => {
    fs.writeFileSync(openPath, "\uFEFF# BOM note");
    expect(fs.readFileSync(openPath).subarray(0, 3)).toEqual(BOM);
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
      localStorage.setItem("markdownmagic:e2e:open-path", p);
    }, openPath);
  }

  it("opens a BOM-prefixed file with the BOM stripped and saves it cleanly", async () => {
    await browser.pause(1000);
    await stubOpenDialog();
    await browser.keys(["Control", "o"]);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${openFilename} — Markdown-Magic`,
      {
        timeout: 10000,
        timeoutMsg: "title did not update to the opened filename",
      },
    );

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getText()).includes("BOM note"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the opened content",
      },
    );

    // Ctrl/Cmd+S writes to the canonical path of the opened Document, so the
    // whole read→write round trip is exercised. The BOM must be gone: it was
    // stripped on read, and the write produces clean UTF-8.
    await browser.keys(["Control", "s"]);
    await browser.waitUntil(
      async () => {
        const bytes = fs.readFileSync(openPath);
        return !bytes.subarray(0, 3).equals(BOM);
      },
      {
        timeout: 10000,
        timeoutMsg: "saved file still carries a leading BOM",
      },
    );

    expect(fs.readFileSync(openPath, "utf8")).toBe("# BOM note");
  });
});
