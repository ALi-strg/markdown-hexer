// Typing into the CodeMirror Editor Pane.
//
// WebDriverIO's `addValue` (element send keys) drops `\n` characters on
// WebKitGTK instead of converting them into Enter presses, so multiline input
// silently loses its line breaks (text collapses onto one line). The Actions API
// (`browser.keys`) does deliver an Enter key, so type line-by-line: printable
// segments go through `addValue`, line breaks through `keys("Enter")`. This
// mirrors the same click → Cmd/Ctrl+End → type sequence the specs already used,
// so the caret always lands at the end of the Document before typing.
export async function typeInEditor(text: string): Promise<void> {
  const editorContent = await $('[data-testid="editor-pane"] .cm-content');
  await editorContent.waitForDisplayed({ timeout: 15000 });
  await editorContent.click();
  await browser.keys(["Control", "End"]);

  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await browser.keys("Enter");
    }
    if (parts[i]) {
      await editorContent.addValue(parts[i]);
    }
  }
}
