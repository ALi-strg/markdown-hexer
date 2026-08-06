import { pickGuardChoice } from "./guardDialog";

export type GuardDecision = "save" | "discard" | "cancel";

export interface GuardDocument {
  dirty: boolean;
  filename: string;
  save: () => Promise<boolean>;
}

/// Runs the Confirm-Discard Guard for a Document.
///
/// A clean Document proceeds (`discard`) without showing a dialog. A Dirty
/// Document shows the native Save / Don't Save / Cancel dialog:
/// - Save runs the Save flow (Save As for an Untitled Document) and returns
///   `save` on success; a failed or cancelled Save aborts (`cancel`).
/// - Don't Save discards and returns `discard`.
/// - Cancel returns `cancel`.
export async function confirmDiscard(
  document: GuardDocument,
): Promise<GuardDecision> {
  if (!document.dirty) {
    return "discard";
  }
  const choice = await pickGuardChoice(document.filename);
  if (choice === "save") {
    return (await document.save()) ? "save" : "cancel";
  }
  return choice === "dont-save" ? "discard" : "cancel";
}
