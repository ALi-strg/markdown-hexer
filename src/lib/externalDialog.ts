import { invoke } from "@tauri-apps/api/core";

export type ExternalChoice = "reload" | "overwrite" | "cancel";

const E2E_EXTERNAL_CHOICE_KEY = "markdownhexer:e2e:external-choice";

const CHOICES: ExternalChoice[] = ["reload", "overwrite", "cancel"];

function isExternalChoice(value: unknown): value is ExternalChoice {
  return (
    typeof value === "string" &&
    (CHOICES as string[]).includes(value)
  );
}

/// Shows the native Externally-Modified dialog and returns the user's choice.
///
/// In an E2E build (`VITE_E2E=1`) the native dialog is bypassed: the
/// WebdriverIO test seeds a choice in localStorage and this returns it directly,
/// so the Externally-Modified decision logic still runs for real.
export async function pickExternalModificationChoice(
  filename: string,
): Promise<ExternalChoice> {
  if (import.meta.env.VITE_E2E === "1") {
    const stubbed = localStorage.getItem(E2E_EXTERNAL_CHOICE_KEY);
    if (isExternalChoice(stubbed)) {
      return stubbed;
    }
  }
  const result = await invoke<string>("show_external_modified", { filename });
  return isExternalChoice(result) ? result : "cancel";
}
