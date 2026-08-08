import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// The OS file-manager double-click (file association) cannot be driven by
// WebdriverIO, so the E2E triggers the app's file-open seam (enabled by
// VITE_E2E in the E2E build) with a real temp path. That seam runs the same
// runLaunchFileOpen → runGuardedOpen code path a file association (or a
// single-instance forwarded path) uses. On Linux the forwarded open is driven
// through that seam too: a real second WebKitGTK process cannot be spawned
// headlessly (without a session bus the single-instance plugin cannot forward,
// so the second instance opens its own webview and kills the shared
// tauri-driver, failing every remaining spec). On platforms with working
// native single-instance forwarding, the test spawns a real second process to
// validate the no-second-window behavior end to end.
describe("Markdown-Magic file association & single-instance open", () => {
  const firstPath = path.join(
    os.tmpdir(),
    `markdownmagic-e2e-open-first-${Date.now()}.md`,
  );
  const secondPath = path.join(
    os.tmpdir(),
    `markdownmagic-e2e-open-second-${Date.now()}.md`,
  );
  const firstFilename = path.basename(firstPath);
  const secondFilename = path.basename(secondPath);

  before(() => {
    fs.writeFileSync(firstPath, "# First instance");
    fs.writeFileSync(secondPath, "# Second instance");
  });

  after(() => {
    for (const file of [firstPath, secondPath]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // already removed
      }
    }
  });

  async function triggerFileOpen(filePath: string) {
    await browser.execute((p) => {
      (
        window as unknown as {
          __triggerFileOpen: (path: string) => void;
        }
      ).__triggerFileOpen(p);
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

  it("opens a file the app was launched with through the Open flow", async () => {
    await browser.pause(1000);
    await triggerFileOpen(firstPath);

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${firstFilename} — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "file-open did not update the title" },
    );

    const editorPane = await $('[data-testid="editor-pane"]');
    await browser.waitUntil(async () => !(await editorPane.isDisplayed()), {
      timeout: 10000,
      timeoutMsg:
        "Editor Pane stayed visible after file-open (expected Preview Only)",
    });

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes("First instance"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the launched content",
      },
    );
  });

  it("runs the Confirm-Discard Guard when opening onto a Dirty Document", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    const editorContent = await $(
      '[data-testid="editor-pane"] .cm-content',
    );
    await editorContent.waitForDisplayed({ timeout: 15000 });
    await typeText("# Local edits");
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${firstFilename} * — Markdown-Magic`,
      { timeout: 10000, timeoutMsg: "asterisk did not appear after editing" },
    );

    await stubGuardChoice("cancel");
    await triggerFileOpen(secondPath);
    await browser.pause(500);

    expect(await browser.getTitle()).toBe(`${firstFilename} * — Markdown-Magic`);
  });

  it("forwards a second launch to the running window without a second window", async () => {
    await stubGuardChoice("dont-save");

    if (process.platform === "linux") {
      // Headless WebKitGTK cannot spawn a real second instance (see the
      // describe comment): drive the same forwarded-open handler the
      // single-instance plugin's file-open-requested event triggers.
      await triggerFileOpen(secondPath);
    } else {
      const binary = path.resolve(
        process.cwd(),
        "src-tauri",
        "target",
        "debug",
        process.platform === "win32" ? "markdown-editor.exe" : "markdown-editor",
      );
      expect(fs.existsSync(binary)).toBe(true);

      const result = spawnSync(binary, [secondPath], {
        timeout: 15000,
        stdio: "ignore",
      });
      // The second process must exit immediately after forwarding, so no second
      // window can ever be shown.
      expect(result.status).toBe(0);
    }

    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) === `${secondFilename} — Markdown-Magic`,
      {
        timeout: 15000,
        timeoutMsg: "second launch did not open in the running window",
      },
    );

    const preview = await $('[data-testid="preview-pane"] .preview-host');
    await browser.waitUntil(
      async () => (await preview.getHTML()).includes("Second instance"),
      {
        timeout: 10000,
        timeoutMsg: "Preview Pane did not render the forwarded content",
      },
    );
  });
});
