import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../lib/saveDialog";
import { pickExternalModificationChoice } from "../lib/externalDialog";
import { clearPreservedTabEditorState } from "../lib/tabEditorState";
import type { GuardDocument } from "../lib/confirmDiscard";
import type { MatchRange } from "../lib/findReplace";
import { useUiStore, type LayoutMode } from "./ui";

const UNTITLED_FILENAME = "Untitled.md";
const APP_TITLE_SUFFIX = " — Markdown Hexer";
const SAVE_FAILED_MESSAGE = "Save failed — your changes are not on disk";
const OPEN_FAILED_MESSAGE = "Open failed — the file could not be read";
const SAVE_AS_COLLISION_MESSAGE =
  "Save As refused — that file is already open in another Tab";

/// One open Document's full session state. The workspace owns an ordered list
/// of these plus an Active index; the Active-Document surface the app already
/// uses (content, canonical path, Dirty, filename, title, save/open/new/
/// external-modification) reads and writes the Active Tab only.
export interface Tab {
  content: string;
  canonicalPath: string | null;
  savedContent: string;
  diskContent: string | null;
  layoutMode: LayoutMode;
  findQuery: string;
  currentMatch: MatchRange | null;
  /// The per-session Untitled number of a pathless Document; `null` once the
  /// Document has a canonical path. Numbers are handed out from the currently
  /// open Untitled Tabs: the next number is one past the highest open one, or
  /// 1 when no Untitled Tab is open (so a consumed launch Tab frees number 1).
  untitledNumber: number | null;
}

/// The Display name of an Untitled Document from its session number:
/// `Untitled.md`, `Untitled 2.md`, …
export function untitledName(number: number): string {
  return number === 1 ? UNTITLED_FILENAME : `Untitled ${number}.md`;
}

/// Whether a Tab's Document is Dirty: its content differs from what is saved.
/// The store's `dirty` computed and the Tab Bar's Dirty marker share this, so
/// the definition of Dirty has a single home.
export function isTabDirty(tab: Tab): boolean {
  return tab.content !== tab.savedContent;
}

/// The Display name of a Tab's Document: the filename for a titled Document,
/// the numbered Untitled name for a pathless one. The Tab Bar and the window
/// title both derive their labels from this.
export function tabDisplayName(tab: Tab): string {
  if (tab.canonicalPath !== null) {
    return tab.canonicalPath.split(/[\\/]/).pop() ?? UNTITLED_FILENAME;
  }
  return untitledName(tab.untitledNumber ?? 1);
}

function createUntitledTab(number: number): Tab {
  return {
    content: "",
    canonicalPath: null,
    savedContent: "",
    diskContent: null,
    layoutMode: "split",
    findQuery: "",
    currentMatch: null,
    untitledNumber: number,
  };
}

/// The index of the Tab holding `path`, or -1 when no Tab holds it. The
/// one-Tab-per-path invariant's matching rule has a single home here: Open
/// focuses the existing Tab, and Save As refuses the path, both by this exact
/// equality.
function findTabByPath(tabs: Tab[], path: string): number {
  return tabs.findIndex((tab) => tab.canonicalPath === path);
}

/// Whether `path` is already open in a Tab other than `tab`. The one-Tab-per-
/// path invariant forbids Save As onto such a path, exactly as it forbids
/// opening it, so both checks share `findTabByPath`. The Tab doing the Save As
/// is excluded: re-selecting its own canonical path is a normal write, not a
/// collision.
function isOpenInAnotherTab(tabs: Tab[], tab: Tab, path: string): boolean {
  const index = findTabByPath(tabs, path);
  return index !== -1 && tabs[index] !== tab;
}

/// The store was a single Document; it is now a workspace of Tabs. The store
/// name and the Document-shaped public surface are kept so existing consumers
/// and tests keep working unchanged while the state model becomes a Tab list.
export const useDocumentStore = defineStore("document", () => {
  const tabs = ref<Tab[]>([createUntitledTab(1)]);
  const activeIndex = ref(0);

  /// The Active Tab — the one the Document surface mirrors.
  function activeTab(): Tab {
    return tabs.value[activeIndex.value];
  }

  /// The Active Document's content, exposed so existing consumers keep reading
  /// the same surface while the real state lives on the Active Tab record.
  /// Edits always flow through `mirrorContent`; there is no second write route.
  const content = computed(() => activeTab().content);

  const canonicalPath = computed<string | null>({
    get: () => activeTab().canonicalPath,
    set: (path) => {
      activeTab().canonicalPath = path;
    },
  });

  const dirty = computed(() => isTabDirty(activeTab()));

  const filename = computed(() => tabDisplayName(activeTab()));

  const title = computed(() => {
    const asterisk = dirty.value ? " *" : "";
    return `${filename.value}${asterisk}${APP_TITLE_SUFFIX}`;
  });

  function mirrorContent(text: string) {
    activeTab().content = text;
  }

  /// Tells the Rust `asset://` protocol which directory to scope image serving
  /// to. Called whenever the Active Document's canonical path changes so
  /// relative image paths always resolve against the current Document's
  /// directory.
  function syncAssetRoot() {
    void invoke("set_asset_root", { documentPath: activeTab().canonicalPath });
  }

  /// Writes `text` to `path`, surfacing a failure as a toast. Does not update
  /// the Document's path, Dirty state, or Externally-Modified baseline.
  async function writeToDisk(path: string, text: string): Promise<boolean> {
    try {
      await invoke("save_document", { path, content: text });
      return true;
    } catch (error) {
      const ui = useUiStore();
      ui.showToast(
        typeof error === "string" && error.length > 0
          ? `Save failed: ${error}`
          : SAVE_FAILED_MESSAGE,
      );
      return false;
    }
  }

  /// Writes the Tab's content to `path` and makes it the saved baseline.
  /// `tab` defaults to the Active Tab; the Guard passes the Tab it is
  /// prompting for, so a background Dirty Tab's Save writes its own content —
  /// never the Active Tab's.
  async function writeToPath(
    path: string,
    tab: Tab = activeTab(),
  ): Promise<boolean> {
    if (!(await writeToDisk(path, tab.content))) {
      return false;
    }
    tab.canonicalPath = path;
    // A Document with a canonical path is no longer Untitled; drop the session
    // number so the field's contract ("null once the Document has a canonical
    // path") holds for every Tab, not just ones created by openPathInTab.
    tab.untitledNumber = null;
    tab.savedContent = tab.content;
    tab.diskContent = tab.content;
    syncAssetRoot();
    useUiStore().setLastDirectory(path);
    return true;
  }

  /// Saves the Tab: Save As for a pathless (Untitled) Tab, direct write
  /// otherwise. `tab` defaults to the Active Tab; the Guard passes the Tab it
  /// is prompting for.
  async function save(tab: Tab = activeTab()): Promise<boolean> {
    if (tab.canonicalPath === null) {
      return saveAs(tab);
    }
    return writeToPath(tab.canonicalPath, tab);
  }

  async function saveAs(tab: Tab = activeTab()): Promise<boolean> {
    const ui = useUiStore();
    const path = await pickSavePath({
      defaultPath: tab.canonicalPath ?? ui.lastDirectory ?? undefined,
    });
    if (path === null) {
      return false;
    }
    if (isOpenInAnotherTab(tabs.value, tab, path)) {
      ui.showToast(SAVE_AS_COLLISION_MESSAGE);
      return false;
    }
    return writeToPath(path, tab);
  }

  /// The Confirm-Discard Guard's view of a Tab: its Dirty flag and filename,
  /// with a Save that targets the Tab itself rather than the Active one. The
  /// Tab Bar's close control and the window-close pass both prompt per Tab
  /// through this, so every Guard in the app agrees on what a Tab's Save does.
  function guardDocumentFor(tab: Tab): GuardDocument {
    return {
      dirty: isTabDirty(tab),
      filename: tabDisplayName(tab),
      save: () => save(tab),
    };
  }

  /// Inserts `tab` right after the Active Tab and makes it Active. Every Tab
  /// added during a session goes through here, so the insertion rule (new work
  /// appears adjacent to what the user was doing) has a single home.
  function insertAfterActive(tab: Tab) {
    tabs.value.splice(activeIndex.value + 1, 0, tab);
    activeIndex.value += 1;
  }

  /// Adds a fresh Untitled Tab right after the Active Tab and makes it Active.
  /// The Untitled number is one past the highest number currently open — or 1
  /// when no Untitled Tab is open, so the first `New` after the launch Tab was
  /// consumed restarts at `Untitled.md`. Never runs the Confirm-Discard Guard
  /// — nothing is discarded.
  function newTab(): Tab {
    let highest = 0;
    for (const tab of tabs.value) {
      if (tab.untitledNumber !== null && tab.untitledNumber > highest) {
        highest = tab.untitledNumber;
      }
    }
    const tab = createUntitledTab(highest + 1);
    insertAfterActive(tab);
    syncAssetRoot();
    return tab;
  }

  /// Opens a file at `path` in a Tab: a new Tab is added right after the Active
  /// Tab and made Active, or — when the path is already open — the existing Tab
  /// is focused instead (one Tab per path). Never runs the Confirm-Discard
  /// Guard. Returns "opened" for a new Tab, "focused" for an already-open path,
  /// or null when the read failed (a toast is shown and no Tab changes).
  async function openPathInTab(path: string): Promise<"opened" | "focused" | null> {
    const existing = findTabByPath(tabs.value, path);
    if (existing !== -1) {
      switchTab(existing);
      return "focused";
    }
    let text: string;
    try {
      text = await invoke<string>("open_document", { path });
    } catch (error) {
      const ui = useUiStore();
      ui.showToast(
        typeof error === "string" && error.length > 0
          ? `Open failed: ${error}`
          : OPEN_FAILED_MESSAGE,
      );
      return null;
    }
    // The duplicate check above ran before the read, so two opens of the same
    // path can race it (a startup forward arriving while the pending-file
    // pull's open is in flight, a drop racing a forward): re-check now that
    // the read is done and focus the Tab that appeared, never inserting a
    // second Tab for the same path.
    const appeared = findTabByPath(tabs.value, path);
    if (appeared !== -1) {
      switchTab(appeared);
      return "focused";
    }
    const tab: Tab = {
      content: text,
      canonicalPath: path,
      savedContent: text,
      diskContent: text,
      layoutMode: "preview",
      findQuery: "",
      currentMatch: null,
      untitledNumber: null,
    };
    // A sole empty Untitled Tab is a placeholder the workspace holds until a
    // real file arrives: Open replaces it in place instead of stacking the
    // opened file behind it. The rule fires only when the Tab is the sole one
    // (a user who deliberately keeps an Untitled Tab open is never surprised)
    // and only when its content is empty — an empty Untitled Document is clean
    // by construction, so nothing is discarded and the Confirm-Discard Guard
    // cannot run.
    if (
      tabs.value.length === 1 &&
      tabs.value[0].canonicalPath === null &&
      tabs.value[0].content === ""
    ) {
      tabs.value[0] = tab;
      syncAssetRoot();
      useUiStore().setLastDirectory(path);
      return "opened";
    }
    insertAfterActive(tab);
    syncAssetRoot();
    useUiStore().setLastDirectory(path);
    return "opened";
  }

  /// Replaces the Active Document with the on-disk version, treating it as the
  /// new saved baseline so Dirty clears and the change is not re-detected.
  /// The preserved editor state is cleared: the on-disk version replaced the
  /// Document, so a later switch back must rebuild rather than restore a stale
  /// cursor and undo history. `tab` defaults to the Active Tab; a caller that
  /// captured a Tab across an await passes it so the reload always targets the
  /// same Document.
  function reloadFrom(text: string, tab: Tab = activeTab()) {
    tab.content = text;
    tab.savedContent = text;
    tab.diskContent = text;
    clearPreservedTabEditorState(tab);
  }

  /// Writes the current content over the Document's file without clearing
  /// Dirty: an Overwrite resolves the conflict but is not a Save. `tab` defaults
  /// to the Active Tab; a caller that captured a Tab across an await passes it
  /// so the Overwrite always targets the same Document.
  async function overwriteToDisk(tab: Tab = activeTab()): Promise<boolean> {
    if (tab.canonicalPath === null) {
      return false;
    }
    if (!(await writeToDisk(tab.canonicalPath, tab.content))) {
      return false;
    }
    tab.diskContent = tab.content;
    return true;
  }

  /// Detects an Externally-Modified file for the Active Tab.
  ///
  /// The check runs on window focus and whenever a Tab becomes Active, so a
  /// background Tab is only ever checked the moment it becomes Active — never
  /// while it sits hidden.
  ///
  /// Compares the on-disk content against the state seen at load/save time. A
  /// clean Document reloads silently; a Dirty Document asks the user for
  /// Reload / Overwrite / Cancel. Returns whether the Document content was
  /// replaced by a reload (silent or chosen), so the caller can push it into
  /// the editor.
  async function checkExternalModification(): Promise<boolean> {
    const tab = activeTab();
    if (tab.canonicalPath === null) {
      return false;
    }
    let state: { content: string } | null | undefined;
    try {
      state = await invoke<{ content: string } | null | undefined>(
        "inspect_document",
        {
          path: tab.canonicalPath,
        },
      );
    } catch {
      return false;
    }
    // An inspect that yields no content is treated like an unreadable file:
    // no external change is detected. (The Rust command always returns the
    // state or rejects, so this is defensive.)
    if (state === null || state === undefined) {
      return false;
    }
    if (state.content === tab.diskContent) {
      return false;
    }
    // The check targets the captured Tab for its whole duration — the Dirty
    // flag, the dialog's filename, and the reload/overwrite all use `tab`, so
    // a Tab that becomes Active mid-check is judged by its own state, never by
    // whichever Tab is Active when the dialog resolves.
    if (!isTabDirty(tab)) {
      reloadFrom(state.content, tab);
      return true;
    }
    const choice = await pickExternalModificationChoice(tabDisplayName(tab));
    if (choice === "reload") {
      reloadFrom(state.content, tab);
      return true;
    }
    if (choice === "overwrite") {
      await overwriteToDisk(tab);
    }
    return false;
  }

  /// Removes the Tab at `index`. Closing the Active Tab activates the Tab to
  /// its right, or — when the last Tab closes — the new last Tab; closing a
  /// background Tab leaves the Active Tab alone. The last remaining Tab is
  /// never removed: the workspace must always hold at least one Tab so the
  /// Active index stays valid, and closing the last Tab means closing the
  /// window (the caller owns that step, so the store stays Tauri-free). The
  /// closed Tab's preserved editor state dies with it (the WeakMap keys on
  /// the Tab record).
  function closeTab(index: number): void {
    if (index < 0 || index >= tabs.value.length || tabs.value.length === 1) {
      return;
    }
    tabs.value.splice(index, 1);
    if (index < activeIndex.value) {
      activeIndex.value -= 1;
    } else if (index === activeIndex.value) {
      activeIndex.value = Math.min(index, tabs.value.length - 1);
    }
    syncAssetRoot();
  }

  /// Switches the Active Tab to `index`. Indices outside the Tab list are
  /// ignored so the Active index always stays a valid Tab index. Returns
  /// whether the switch happened. The `asset://` scope follows the Active
  /// Document, so it is re-scoped on every switch.
  function switchTab(index: number): boolean {
    if (index < 0 || index >= tabs.value.length) {
      return false;
    }
    activeIndex.value = index;
    syncAssetRoot();
    return true;
  }

  /// Cycles the Active Tab by `delta` steps through the Tab list, wrapping at
  /// both ends. A single-Tab workspace stays put. Returns whether the Active
  /// Tab changed, mirroring `switchTab`; the `asset://` scope follows the
  /// Document that becomes Active.
  function cycleTab(delta: number): boolean {
    if (tabs.value.length <= 1) {
      return false;
    }
    const count = tabs.value.length;
    return switchTab((activeIndex.value + delta + count) % count);
  }

  return {
    tabs,
    activeIndex,
    activeTab,
    switchTab,
    cycleTab,
    closeTab,
    guardDocumentFor,
    content,
    canonicalPath,
    dirty,
    filename,
    title,
    mirrorContent,
    save,
    saveAs,
    newTab,
    openPathInTab,
    checkExternalModification,
  };
});
