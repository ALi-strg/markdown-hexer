import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Preview asset handling: a Document whose directory holds the image it
// references must render that image through the scoped asset:// protocol, and
// its links must render as ordinary anchors. The E2E uses a real temp directory
// so the relative path actually resolves, and asserts the image loads (which
// exercises the Rust directory-scoped protocol handler end to end).
describe("ALi-md-editor preview asset handling", () => {
  const dir = path.join(os.tmpdir(), `alimd-e2e-assets-${Date.now()}`);
  const docPath = path.join(dir, "note.md");
  const imagePath = path.join(dir, "pic.png");
  const docFilename = path.basename(docPath);
  const encodedImagePath = encodeURIComponent(imagePath);

  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(docPath, [
      "# Assets",
      "",
      "![diagram](pic.png)",
      "",
      "[Tauri](https://v2.tauri.app/)",
      "",
    ].join("\n"));
    const oneByOnePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    fs.writeFileSync(imagePath, oneByOnePng);
  });

  after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // already removed
    }
  });

  async function stubOpenDialog(filePath: string) {
    await browser.execute((p) => {
      localStorage.setItem("alimd:e2e:open-path", p);
    }, filePath);
  }

  async function stubGuardChoice(choice: string) {
    await browser.execute((c) => {
      localStorage.setItem("alimd:e2e:guard-choice", c);
    }, choice);
  }

  async function openDocumentInPreviewOnly() {
    await browser.pause(1000);
    await stubGuardChoice("dont-save");
    await stubOpenDialog(docPath);
    await browser.keys(["Control", "o"]);
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${docFilename} — ALi-md-editor`,
      { timeout: 10000, timeoutMsg: "Open did not load the Document" },
    );
  }

  it("renders a relative image through the asset protocol against the Document's directory", async () => {
    await openDocumentInPreviewOnly();

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    const img = await preview.$("img");
    await img.waitForExist({ timeout: 10000 });

    // The asset scheme is normalized differently per webview: WebView2 reports
    // `http://asset.localhost/<path>`, WebKitGTK reports `asset://localhost/<path>`.
    // Both resolve to the same resource, so assert on the encoded path only.
    const src = (await img.getAttribute("src")) ?? "";
    expect(new URL(src).pathname).toBe(`/${encodedImagePath}`);

    await browser.waitUntil(
      async () =>
        (await browser.execute(
          (selector) => {
            const element = document.querySelector(
              selector,
            ) as HTMLImageElement | null;
            return element ? element.naturalWidth : 0;
          },
          '[data-testid="preview-pane"] .preview-host img',
        )) > 0,
      {
        timeout: 10000,
        timeoutMsg: "the relative image did not load through the asset protocol",
      },
    );
  });

  it("renders a link as an anchor ready to open in the system browser", async () => {
    const preview = await $('[data-testid="preview-pane"] .preview-host');
    const link = await preview.$('a[href="https://v2.tauri.app/"]');
    await link.waitForExist({ timeout: 10000 });
    expect(await link.getText()).toBe("Tauri");
  });
});
