import type { FormatOperation } from "./formatting";

export interface KeyCombo {
  /// The KeyboardEvent.key to match, case-insensitively.
  key: string;
  ctrlCmd: boolean;
  shift: boolean;
}

export interface ShortcutEntry {
  label: string;
  /// The keyboard combo, or null for controls without a shortcut (Theme, Font).
  combo: KeyCombo | null;
}

export function comboLabel(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrlCmd) {
    parts.push("Ctrl/Cmd");
  }
  if (combo.shift) {
    parts.push("Shift");
  }
  parts.push(combo.key.toUpperCase());
  return parts.join("+");
}

/// The tooltip text for a control: `Name (Ctrl/Cmd+X)` when it has a shortcut,
/// the bare name otherwise.
export function tooltipText(entry: ShortcutEntry): string {
  return entry.combo === null
    ? entry.label
    : `${entry.label} (${comboLabel(entry.combo)})`;
}

/// Tooltip text for a control whose label is composed at the call site (the
/// Layout Switcher segments) from the shared cycle-layout combo.
export function tooltipWithCombo(label: string, combo: KeyCombo): string {
  return `${label} (${comboLabel(combo)})`;
}

/// True when a keydown event carries this combo's modifiers and key. A combo
/// that needs Shift requires it; a combo that doesn't (Bold, Italic, Link)
/// also fires when Shift is held, matching the app's long-standing behaviour.
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const modifier = event.ctrlKey || event.metaKey;
  return (
    modifier === combo.ctrlCmd &&
    (!combo.shift || event.shiftKey) &&
    event.key.toLowerCase() === combo.key.toLowerCase()
  );
}

/// The single registry of toolbar controls to their labels and shortcuts.
/// Both the tooltips and the Shortcuts Reference draw from this, so the two can
/// never drift.
export const FORMAT_SHORTCUTS: Record<FormatOperation, ShortcutEntry> = {
  bold: {
    label: "Bold",
    combo: { key: "b", ctrlCmd: true, shift: false },
  },
  italic: {
    label: "Italic",
    combo: { key: "i", ctrlCmd: true, shift: false },
  },
  heading: {
    label: "Heading",
    combo: { key: "h", ctrlCmd: true, shift: true },
  },
  list: {
    label: "List",
    combo: { key: "l", ctrlCmd: true, shift: true },
  },
  link: {
    label: "Link",
    combo: { key: "k", ctrlCmd: true, shift: false },
  },
  code: {
    label: "Code",
    combo: { key: "c", ctrlCmd: true, shift: true },
  },
};

/// The shortcut that cycles the Layout Modes, shared by the Layout Switcher
/// segments' tooltips and the cycle keydown handler.
export const CYCLE_LAYOUT_COMBO: KeyCombo = {
  key: "p",
  ctrlCmd: true,
  shift: true,
};

export const THEME_CONTROL: ShortcutEntry = {
  label: "Theme",
  combo: null,
};

export const FONT_CONTROL: ShortcutEntry = {
  label: "Font",
  combo: null,
};

export type DocumentControlOperation =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "findReplace";

/// The Document Controls group — New, Open, Save, Save As, and Find & Replace —
/// at the left end of the toolbar. Their tooltips (and the Shortcuts Reference)
/// draw from this registry so the two can never drift.
export const DOCUMENT_SHORTCUTS: Record<
  DocumentControlOperation,
  ShortcutEntry
> = {
  new: {
    label: "New",
    combo: { key: "n", ctrlCmd: true, shift: false },
  },
  open: {
    label: "Open",
    combo: { key: "o", ctrlCmd: true, shift: false },
  },
  save: {
    label: "Save",
    combo: { key: "s", ctrlCmd: true, shift: false },
  },
  saveAs: {
    label: "Save As",
    combo: { key: "s", ctrlCmd: true, shift: true },
  },
  findReplace: {
    label: "Find & Replace",
    combo: { key: "f", ctrlCmd: true, shift: false },
  },
};

/// Undo / Redo reflect CodeMirror's native history; the shortcuts themselves are
/// bound by CodeMirror's default keymap (`Mod-z`, `Mod-Shift-z` / `Mod-y`).
export const UNDO_SHORTCUT: ShortcutEntry = {
  label: "Undo",
  combo: { key: "z", ctrlCmd: true, shift: false },
};

export const REDO_SHORTCUT: ShortcutEntry = {
  label: "Redo",
  combo: { key: "z", ctrlCmd: true, shift: true },
};

/// The View action the Layout Switcher and the cycle shortcut both perform,
/// listed in the Shortcuts Reference. Shares the cycle combo with the Layout
/// Switcher segments' tooltips.
export const CYCLE_LAYOUT_SHORTCUT: ShortcutEntry = {
  label: "Cycle layout",
  combo: CYCLE_LAYOUT_COMBO,
};

/// The Help control: a toolbar button that opens the Shortcuts Reference. Its
/// `Ctrl/Cmd+/` shortcut also toggles the reference from any Layout Mode.
export const HELP_SHORTCUT: ShortcutEntry = {
  label: "Help",
  combo: { key: "/", ctrlCmd: true, shift: false },
};

export interface ShortcutGroup {
  label: string;
  entries: ShortcutEntry[];
}

/// The Shortcuts Reference contents, grouped by category. Every entry is the
/// same `ShortcutEntry` object the tooltips read, so the modal can never drift
/// from the toolbar.
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "File",
    entries: [
      DOCUMENT_SHORTCUTS.new,
      DOCUMENT_SHORTCUTS.open,
      DOCUMENT_SHORTCUTS.save,
      DOCUMENT_SHORTCUTS.saveAs,
    ],
  },
  {
    label: "Edit",
    entries: [UNDO_SHORTCUT, REDO_SHORTCUT, DOCUMENT_SHORTCUTS.findReplace],
  },
  {
    label: "Format",
    entries: [
      FORMAT_SHORTCUTS.bold,
      FORMAT_SHORTCUTS.italic,
      FORMAT_SHORTCUTS.heading,
      FORMAT_SHORTCUTS.list,
      FORMAT_SHORTCUTS.link,
      FORMAT_SHORTCUTS.code,
    ],
  },
  {
    label: "View",
    entries: [CYCLE_LAYOUT_SHORTCUT],
  },
  {
    label: "Help",
    entries: [HELP_SHORTCUT],
  },
];
