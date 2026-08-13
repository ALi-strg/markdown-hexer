import { invoke } from "@tauri-apps/api/core";

export type GuardChoice = "save" | "dont-save" | "cancel";

const E2E_GUARD_CHOICE_KEY = "markdownhexer:e2e:guard-choice";

const CHOICES: GuardChoice[] = ["save", "dont-save", "cancel"];

function isGuardChoice(value: unknown): value is GuardChoice {
  return (
    typeof value === "string" &&
    (CHOICES as string[]).includes(value)
  );
}

/// Shows the native Confirm-Discard Guard dialog and returns the user's choice.
///
/// In an E2E build (`VITE_E2E=1`) the native dialog is bypassed: the
/// WebdriverIO test seeds a choice in localStorage and this returns it directly,
/// so the guard logic still runs for real.
export async function pickGuardChoice(filename: string): Promise<GuardChoice> {
  if (import.meta.env.VITE_E2E === "1") {
    const stubbed = localStorage.getItem(E2E_GUARD_CHOICE_KEY);
    if (isGuardChoice(stubbed)) {
      return stubbed;
    }
  }
  const result = await invoke<string>("show_confirm_discard", { filename });
  return isGuardChoice(result) ? result : "cancel";
}
