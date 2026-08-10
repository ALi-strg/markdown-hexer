import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../lib/saveDialog";
import { pickExternalModificationChoice } from "../lib/externalDialog";
import type { MatchRange } from "../lib/findReplace";
import { useUiStore, type LayoutMode } from "./ui";

const UNTITLED_FILENAME = "Untitled.md";
const APP_TITLE_SUFFIX = " — Markdown-Magic";
const SAVE_FAILED_MESSAGE = "Save failed — your changes are not on disk";
const OPEN_FAILED_MESSAGE = "Open failed — the file could not be read";

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
}

function createUntitledTab(): Tab {
  return {
    content: "",
    canonicalPath: null,
    savedContent: "",
    diskContent: null,
    layoutMode: "split",
    findQuery: "",
    currentMatch: null,
  };
}

/// The store was a single Document; it is now a workspace of Tabs. The store
/// name and the Document-shaped public surface are kept so existing consumers
/// and tests keep working unchanged while the state model becomes a Tab list.
export const useDocumentStore = defineStore("document", () => {
  const tabs = ref<Tab[]>([createUntitledTab()]);
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

  const dirty = computed(() => activeTab().content !== activeTab().savedContent);

  const filename = computed(() => {
    const path = activeTab().canonicalPath;
    if (path === null) {
      return UNTITLED_FILENAME;
    }
    return path.split(/[\\/]/).pop() ?? UNTITLED_FILENAME;
  });

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

  async function writeToPath(path: string): Promise<boolean> {
    const tab = activeTab();
    if (!(await writeToDisk(path, tab.content))) {
      return false;
    }
    tab.canonicalPath = path;
    tab.savedContent = tab.content;
    tab.diskContent = tab.content;
    syncAssetRoot();
    useUiStore().setLastDirectory(path);
    return true;
  }

  async function save(): Promise<boolean> {
    const tab = activeTab();
    if (tab.canonicalPath === null) {
      return saveAs();
    }
    return writeToPath(tab.canonicalPath);
  }

  async function saveAs(): Promise<boolean> {
    const ui = useUiStore();
    const path = await pickSavePath({
      defaultPath: activeTab().canonicalPath ?? ui.lastDirectory ?? undefined,
    });
    if (path === null) {
      return false;
    }
    return writeToPath(path);
  }

  /// Swaps the Active Document for a fresh Untitled Document.
  ///
  /// The caller runs the Confirm-Discard Guard first when the Document is Dirty.
  function newDocument() {
    const tab = activeTab();
    tab.content = "";
    tab.canonicalPath = null;
    tab.savedContent = "";
    tab.diskContent = null;
    syncAssetRoot();
  }

  /// Reads a file from disk and swaps it into the Active Document.
  ///
  /// On success the path becomes canonical, the title updates to the filename,
  /// and Dirty clears. A failed read keeps the current Document and surfaces the
  /// error as a toast. Returns whether the swap happened.
  async function openDocument(path: string): Promise<boolean> {
    const tab = activeTab();
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
      return false;
    }
    tab.content = text;
    tab.canonicalPath = path;
    tab.savedContent = text;
    tab.diskContent = text;
    syncAssetRoot();
    useUiStore().setLastDirectory(path);
    return true;
  }

  /// Replaces the Active Document with the on-disk version, treating it as the
  /// new saved baseline so Dirty clears and the change is not re-detected.
  /// `tab` defaults to the Active Tab; a caller that captured a Tab across an
  /// await passes it so the reload always targets the same Document.
  function reloadFrom(text: string, tab: Tab = activeTab()) {
    tab.content = text;
    tab.savedContent = text;
    tab.diskContent = text;
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

  /// Detects an Externally-Modified file on window focus.
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
    let state: { content: string };
    try {
      state = await invoke<{ content: string }>("inspect_document", {
        path: tab.canonicalPath,
      });
    } catch {
      return false;
    }
    if (state.content === tab.diskContent) {
      return false;
    }
    if (!dirty.value) {
      reloadFrom(state.content, tab);
      return true;
    }
    const choice = await pickExternalModificationChoice(filename.value);
    if (choice === "reload") {
      reloadFrom(state.content, tab);
      return true;
    }
    if (choice === "overwrite") {
      await overwriteToDisk(tab);
    }
    return false;
  }

  /// Switches the Active Tab to `index`. Indices outside the Tab list are
  /// ignored so the Active index always stays a valid Tab index. Returns
  /// whether the switch happened.
  function switchTab(index: number): boolean {
    if (index < 0 || index >= tabs.value.length) {
      return false;
    }
    activeIndex.value = index;
    return true;
  }

  return {
    tabs,
    activeIndex,
    switchTab,
    content,
    canonicalPath,
    dirty,
    filename,
    title,
    mirrorContent,
    save,
    saveAs,
    newDocument,
    openDocument,
    checkExternalModification,
  };
});
