import { open } from "@tauri-apps/plugin-dialog";

export interface OpenDialogOptions {
  defaultPath?: string;
}

const E2E_OPEN_PATH_KEY = "markdownhexer:e2e:open-path";

/// Opens the native Open dialog.
///
/// Returns the chosen path, or `null` when the user cancels. The dialog starts
/// at `defaultPath` (the last-used directory, or the current Document's
/// directory when it has one) when provided. Filtering to the Markdown family
/// plus `.txt` is a convenience, not a lock: "All files" stays selectable.
///
/// In an E2E build (`VITE_E2E=1`) the native dialog is bypassed: the
/// WebdriverIO test seeds a temp path in localStorage and this returns it
/// directly, so the read still runs through the real `open_document` command.
export async function pickOpenPath(
  options: OpenDialogOptions = {},
): Promise<string | null> {
  if (import.meta.env.VITE_E2E === "1") {
    const stubbed = localStorage.getItem(E2E_OPEN_PATH_KEY);
    if (stubbed !== null) {
      return stubbed;
    }
  }
  const result = await open({
    title: "Open",
    defaultPath: options.defaultPath,
    multiple: false,
    directory: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
      { name: "Text", extensions: ["txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return typeof result === "string" ? result : null;
}
