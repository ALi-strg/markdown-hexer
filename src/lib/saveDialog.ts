import { save } from "@tauri-apps/plugin-dialog";

export interface SaveDialogOptions {
  defaultPath?: string;
}

const E2E_SAVE_PATH_KEY = "markdownmagic:e2e:save-path";

/// Opens the native Save As dialog.
///
/// Returns the chosen path, or `null` when the user cancels. The dialog starts
/// at `defaultPath` (the current Document's path, so it opens in that file's
/// directory with the filename pre-filled) when provided.
///
/// In an E2E build (`VITE_E2E=1`) the native dialog is bypassed: the
/// WebdriverIO test seeds a temp path in localStorage and this returns it
/// directly, so the write still runs through the real `save_document` command.
export async function pickSavePath(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  if (import.meta.env.VITE_E2E === "1") {
    const stubbed = localStorage.getItem(E2E_SAVE_PATH_KEY);
    if (stubbed !== null) {
      return stubbed;
    }
  }
  const result = await save({
    title: "Save As",
    defaultPath: options.defaultPath,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
      { name: "Text", extensions: ["txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return result ?? null;
}
