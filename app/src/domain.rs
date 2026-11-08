use std::path::{Path, PathBuf};

use crate::platform::ReadError;

pub const APP_NAME: &str = "Markdown Hexer";
pub const UNTITLED_NAME: &str = "Untitled.md";

pub fn untitled_name(number: u32) -> String {
    if number == 1 {
        UNTITLED_NAME.to_owned()
    } else {
        format!("Untitled {number}.md")
    }
}

pub type DocumentId = u64;

/// A Document's view mode.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Preview,
    Edit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    /// Stable identity for per-Document editor state.
    pub id: DocumentId,
    /// `None` until an Untitled Document is saved.
    pub path: Option<PathBuf>,
    /// The open Untitled number; `None` once the Document has a path.
    pub untitled_number: Option<u32>,
    pub content: String,
    pub saved_content: String,
    pub mode: Mode,
    /// Bumped on every content change; editor highlight caches key off it.
    pub revision: u64,
}

impl Document {
    /// A file-backed Document always starts in Preview.
    pub fn new(id: DocumentId, path: PathBuf, content: String) -> Self {
        Self {
            id,
            path: Some(path),
            untitled_number: None,
            saved_content: content.clone(),
            content,
            mode: Mode::Preview,
            revision: 0,
        }
    }

    /// A bare launch starts in Edit so the user can type immediately.
    pub fn untitled(id: DocumentId, number: u32) -> Self {
        Self {
            id,
            path: None,
            untitled_number: Some(number),
            content: String::new(),
            saved_content: String::new(),
            mode: Mode::Edit,
            revision: 0,
        }
    }

    pub fn is_dirty(&self) -> bool {
        self.content != self.saved_content
    }

    pub fn file_name(&self) -> String {
        self.path
            .as_deref()
            .map(file_name)
            .unwrap_or_else(|| untitled_name(self.untitled_number.unwrap_or(1)))
    }

    /// Images resolve relative to the Document's directory.
    pub fn image_scope(&self) -> Option<&Path> {
        self.path.as_deref().and_then(Path::parent)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tab {
    pub document: Document,
}

impl Tab {
    pub fn title(&self) -> String {
        let name = self.document.file_name();
        if self.document.is_dirty() {
            format!("{name} *")
        } else {
            name
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GuardChoice {
    Save,
    DontSave,
    Cancel,
}

/// What the Guard protects once its Document is resolved.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GuardAction {
    CloseTab,
    Quit,
}

/// The app-modal close Guard is showing for this Document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuardState {
    pub document_id: DocumentId,
    pub title: String,
    pub action: GuardAction,
}

/// What happens once a write or an already-clean save resolves.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AfterWrite {
    Nothing,
    CloseTab(DocumentId),
    Quit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SaveDialogState {
    document_id: DocumentId,
    after: AfterWrite,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingWrite {
    document_id: DocumentId,
    path: PathBuf,
    /// Content actually handed to the filesystem. The Document's saved content
    /// becomes this, so an edit made mid-write stays Dirty.
    content: String,
    save_as: bool,
    after: AfterWrite,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Workspace {
    tabs: Vec<Tab>,
    active: Option<usize>,
    next_id: DocumentId,
    guard: Option<GuardState>,
    save_dialog: Option<SaveDialogState>,
    pending_write: Option<PendingWrite>,
    quit_queue: Vec<DocumentId>,
}

impl Workspace {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn tabs(&self) -> &[Tab] {
        &self.tabs
    }

    pub fn active_tab(&self) -> Option<&Tab> {
        self.active.and_then(|index| self.tabs.get(index))
    }

    pub fn active_document(&self) -> Option<&Document> {
        self.active_tab().map(|tab| &tab.document)
    }

    pub fn active_document_mut(&mut self) -> Option<&mut Document> {
        self.active
            .and_then(|index| self.tabs.get_mut(index))
            .map(|tab| &mut tab.document)
    }

    pub fn document(&self, id: DocumentId) -> Option<&Document> {
        self.tabs
            .iter()
            .map(|tab| &tab.document)
            .find(|document| document.id == id)
    }

    pub fn guard(&self) -> Option<&GuardState> {
        self.guard.as_ref()
    }

    pub fn save_dialog_open(&self) -> bool {
        self.save_dialog.is_some()
    }

    /// `<filename> — Markdown Hexer`, with `*` after a dirty filename.
    pub fn window_title(&self) -> String {
        match self.active_tab() {
            Some(tab) => format!("{} — {APP_NAME}", tab.title()),
            None => APP_NAME.to_owned(),
        }
    }

    pub fn apply(&mut self, command: Command) -> Vec<Effect> {
        match command {
            Command::NewUntitled => self.new_untitled(),
            Command::Open => vec![Effect::ShowOpenDialog],
            Command::OpenPath(path) => {
                if let Some(index) = self.find_path(&path) {
                    self.active = Some(index);
                    vec![Effect::SetWindowTitle(self.window_title())]
                } else {
                    vec![Effect::ReadFile(path)]
                }
            }
            Command::FileLoaded { path, content } => {
                self.load_document(path, content);
                vec![Effect::SetWindowTitle(self.window_title())]
            }
            Command::FileLoadFailed { path, error } => vec![Effect::ShowToast(format!(
                "Could not open {}: {error}",
                file_name(&path)
            ))],
            Command::SetMode(mode) => {
                if let Some(document) = self.active_document_mut() {
                    document.mode = mode;
                }
                Vec::new()
            }
            Command::ToggleMode => {
                if let Some(document) = self.active_document_mut() {
                    document.mode = match document.mode {
                        Mode::Preview => Mode::Edit,
                        Mode::Edit => Mode::Preview,
                    };
                }
                Vec::new()
            }
            Command::ContentChanged {
                document_id,
                content,
            } => {
                let title_before = self.window_title();
                if let Some(document) = self
                    .tabs
                    .iter_mut()
                    .map(|tab| &mut tab.document)
                    .find(|document| document.id == document_id)
                    && document.content != content
                {
                    document.content = content;
                    document.revision += 1;
                }
                if self.window_title() != title_before {
                    vec![Effect::SetWindowTitle(self.window_title())]
                } else {
                    Vec::new()
                }
            }
            Command::ActivateTab(document_id) => self.activate_tab(document_id),
            Command::CloseTab(document_id) => self.close_tab(document_id),
            Command::MoveTab { from, to } => self.move_tab(from, to),
            Command::CycleTab(delta) => self.cycle_tab(delta),
            Command::Save => match self.active_document().map(|document| document.id) {
                Some(id) => self.begin_save(id, AfterWrite::Nothing),
                None => Vec::new(),
            },
            Command::SaveAs => match self.active_document().map(|document| document.id) {
                Some(id) => self.begin_save_as(id, AfterWrite::Nothing),
                None => Vec::new(),
            },
            Command::SaveAsChosen(path) => self.save_as_chosen(path),
            Command::SaveDialogCancelled => self.save_dialog_cancelled(),
            Command::WriteSucceeded => self.write_succeeded(),
            Command::WriteFailed(message) => self.write_failed(&message),
            Command::WindowCloseRequested => self.window_close_requested(),
            Command::GuardChosen(choice) => self.guard_chosen(choice),
        }
    }

    /// Tab labels add the parent folder only when two open files share a basename.
    pub fn tab_label(&self, document_id: DocumentId) -> String {
        let Some(tab) = self.tabs.iter().find(|tab| tab.document.id == document_id) else {
            return String::new();
        };
        let mut label = tab.title();
        if let Some(folder) = self.parent_folder(tab) {
            label.push_str(" — ");
            label.push_str(&folder);
        }
        label
    }

    fn parent_folder(&self, tab: &Tab) -> Option<String> {
        let path = tab.document.path.as_deref()?;
        let name = path.file_name()?;
        let collides = self.tabs.iter().any(|other| {
            other.document.id != tab.document.id
                && other.document.path.as_deref().and_then(Path::file_name) == Some(name)
        });
        if !collides {
            return None;
        }
        path.parent()?
            .file_name()
            .map(|folder| folder.to_string_lossy().into_owned())
    }

    fn index_of(&self, document_id: DocumentId) -> Option<usize> {
        self.tabs
            .iter()
            .position(|tab| tab.document.id == document_id)
    }

    fn find_path(&self, path: &Path) -> Option<usize> {
        self.tabs.iter().position(|tab| {
            tab.document
                .path
                .as_deref()
                .is_some_and(|other| paths_match(other, path))
        })
    }

    fn allocate_id(&mut self) -> DocumentId {
        self.next_id += 1;
        self.next_id
    }

    fn new_untitled(&mut self) -> Vec<Effect> {
        let number = self
            .tabs
            .iter()
            .filter_map(|tab| tab.document.untitled_number)
            .max()
            .unwrap_or(0)
            + 1;
        let id = self.allocate_id();
        let index = self.active.map_or(0, |active| active + 1);
        self.tabs.insert(
            index,
            Tab {
                document: Document::untitled(id, number),
            },
        );
        self.active = Some(index);
        vec![Effect::SetWindowTitle(self.window_title())]
    }

    fn activate_tab(&mut self, document_id: DocumentId) -> Vec<Effect> {
        let Some(index) = self.index_of(document_id) else {
            return Vec::new();
        };
        self.active = Some(index);
        vec![Effect::SetWindowTitle(self.window_title())]
    }

    fn cycle_tab(&mut self, delta: i32) -> Vec<Effect> {
        let Some(active) = self.active.filter(|_| self.tabs.len() > 1) else {
            return Vec::new();
        };
        let len = self.tabs.len() as i32;
        self.active = Some((active as i32 + delta).rem_euclid(len) as usize);
        vec![Effect::SetWindowTitle(self.window_title())]
    }

    fn move_tab(&mut self, from: DocumentId, to: usize) -> Vec<Effect> {
        let Some(from) = self.index_of(from) else {
            return Vec::new();
        };
        if from == to || to >= self.tabs.len() {
            return Vec::new();
        }
        let active = self.active;
        let tab = self.tabs.remove(from);
        self.tabs.insert(to, tab);
        if let Some(active) = active {
            self.active = Some(if active == from {
                to
            } else if from < to && active > from && active <= to {
                active - 1
            } else if to < from && active >= to && active < from {
                active + 1
            } else {
                active
            });
        }
        Vec::new()
    }

    fn load_document(&mut self, path: PathBuf, content: String) {
        // The file may have finished reading after another Open already added it.
        if let Some(index) = self.find_path(&path) {
            self.active = Some(index);
            return;
        }
        let id = self.allocate_id();
        let document = Document::new(id, path, content);
        // Opening a file from a bare launch replaces the empty Untitled placeholder.
        let replace_placeholder = self.tabs.len() == 1
            && self.tabs[0].document.path.is_none()
            && self.tabs[0].document.content.is_empty();
        if replace_placeholder {
            self.tabs[0].document = document;
            self.active = Some(0);
        } else {
            let index = self.active.map_or(self.tabs.len(), |active| active + 1);
            self.tabs.insert(index, Tab { document });
            self.active = Some(index);
        }
    }

    fn close_tab(&mut self, document_id: DocumentId) -> Vec<Effect> {
        if self.guard.is_some() || self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        let Some(index) = self.index_of(document_id) else {
            return Vec::new();
        };
        if self.tabs[index].document.is_dirty() {
            let tab = &self.tabs[index];
            self.guard = Some(GuardState {
                document_id,
                title: tab.title(),
                action: GuardAction::CloseTab,
            });
            return Vec::new();
        }
        self.remove_tab(index)
    }

    fn remove_tab(&mut self, index: usize) -> Vec<Effect> {
        // Closing the last Tab is the window's job; v1 keeps it here too.
        if self.tabs.len() <= 1 {
            return vec![Effect::CloseWindow];
        }
        self.tabs.remove(index);
        let active = self.active.unwrap_or(0);
        self.active = Some(if index < active {
            active - 1
        } else if index == active {
            index.min(self.tabs.len() - 1)
        } else {
            active
        });
        vec![Effect::SetWindowTitle(self.window_title())]
    }

    fn begin_save(&mut self, document_id: DocumentId, after: AfterWrite) -> Vec<Effect> {
        if self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        let Some(document) = self.document(document_id) else {
            return Vec::new();
        };
        if document.path.is_none() {
            return self.open_save_dialog(document_id, after);
        }
        if !document.is_dirty() {
            return self.after_write(after);
        }
        match document.path.clone() {
            Some(path) => self.queue_write(document_id, path, false, after),
            None => self.open_save_dialog(document_id, after),
        }
    }

    fn begin_save_as(&mut self, document_id: DocumentId, after: AfterWrite) -> Vec<Effect> {
        if self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        if self.document(document_id).is_none() {
            return Vec::new();
        }
        self.open_save_dialog(document_id, after)
    }

    fn open_save_dialog(&mut self, document_id: DocumentId, after: AfterWrite) -> Vec<Effect> {
        let Some(document) = self.document(document_id) else {
            return Vec::new();
        };
        let suggested_name = document.file_name();
        self.save_dialog = Some(SaveDialogState { document_id, after });
        vec![Effect::ShowSaveDialog { suggested_name }]
    }

    fn save_as_chosen(&mut self, path: PathBuf) -> Vec<Effect> {
        let Some(dialog) = self.save_dialog.take() else {
            return Vec::new();
        };
        let document_id = dialog.document_id;
        if self.document(document_id).is_none() {
            self.abort_after(dialog.after);
            return Vec::new();
        }
        let duplicate = self.tabs.iter().any(|tab| {
            tab.document.id != document_id
                && tab
                    .document
                    .path
                    .as_deref()
                    .is_some_and(|other| paths_match(other, &path))
        });
        if duplicate {
            self.abort_after(dialog.after);
            return vec![Effect::ShowToast(format!(
                "{} is already open",
                file_name(&path)
            ))];
        }
        self.queue_write(document_id, path, true, dialog.after)
    }

    fn save_dialog_cancelled(&mut self) -> Vec<Effect> {
        if let Some(dialog) = self.save_dialog.take() {
            self.abort_after(dialog.after);
        }
        Vec::new()
    }

    fn abort_after(&mut self, after: AfterWrite) {
        if after == AfterWrite::Quit {
            self.quit_queue.clear();
        }
    }

    fn queue_write(
        &mut self,
        document_id: DocumentId,
        path: PathBuf,
        save_as: bool,
        after: AfterWrite,
    ) -> Vec<Effect> {
        let Some(document) = self.document(document_id) else {
            return Vec::new();
        };
        let content = document.content.clone();
        self.pending_write = Some(PendingWrite {
            document_id,
            path: path.clone(),
            content: content.clone(),
            save_as,
            after,
        });
        vec![Effect::WriteFile { path, content }]
    }

    fn write_succeeded(&mut self) -> Vec<Effect> {
        let Some(write) = self.pending_write.take() else {
            return Vec::new();
        };
        if let Some(document) = self
            .tabs
            .iter_mut()
            .map(|tab| &mut tab.document)
            .find(|document| document.id == write.document_id)
        {
            document.saved_content = write.content;
            if write.save_as {
                document.path = Some(write.path);
                document.untitled_number = None;
            }
        }
        let mut effects = Vec::new();
        if write.after != AfterWrite::CloseTab(write.document_id) {
            effects.push(Effect::SetWindowTitle(self.window_title()));
        }
        effects.extend(self.after_write(write.after));
        effects
    }

    fn write_failed(&mut self, message: &str) -> Vec<Effect> {
        let Some(write) = self.pending_write.take() else {
            return Vec::new();
        };
        self.abort_after(write.after);
        vec![Effect::ShowToast(format!(
            "Could not save {}: {message}",
            file_name(&write.path)
        ))]
    }

    fn after_write(&mut self, after: AfterWrite) -> Vec<Effect> {
        match after {
            AfterWrite::Nothing => Vec::new(),
            AfterWrite::CloseTab(document_id) => match self.index_of(document_id) {
                Some(index) => self.remove_tab(index),
                None => Vec::new(),
            },
            AfterWrite::Quit => self.advance_quit(),
        }
    }

    fn advance_quit(&mut self) -> Vec<Effect> {
        while let Some(document_id) = self.quit_queue.first().copied() {
            let Some(tab) = self.tabs.iter().find(|tab| tab.document.id == document_id) else {
                self.quit_queue.remove(0);
                continue;
            };
            if !tab.document.is_dirty() {
                self.quit_queue.remove(0);
                continue;
            }
            let title = tab.title();
            self.guard = Some(GuardState {
                document_id,
                title,
                action: GuardAction::Quit,
            });
            return Vec::new();
        }
        self.quit_queue.clear();
        vec![Effect::CloseWindow]
    }

    fn window_close_requested(&mut self) -> Vec<Effect> {
        // The Guard is already app-modal; a second close request must not stack it.
        if self.guard.is_some() || self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        self.quit_queue = self
            .tabs
            .iter()
            .filter(|tab| tab.document.is_dirty())
            .map(|tab| tab.document.id)
            .collect();
        self.advance_quit()
    }

    fn guard_chosen(&mut self, choice: GuardChoice) -> Vec<Effect> {
        let Some(guard) = self.guard.take() else {
            return Vec::new();
        };
        match (guard.action, choice) {
            (GuardAction::CloseTab, GuardChoice::Cancel) => Vec::new(),
            (GuardAction::CloseTab, GuardChoice::DontSave) => {
                match self.index_of(guard.document_id) {
                    Some(index) => self.remove_tab(index),
                    None => Vec::new(),
                }
            }
            (GuardAction::CloseTab, GuardChoice::Save) => {
                self.begin_save(guard.document_id, AfterWrite::CloseTab(guard.document_id))
            }
            (GuardAction::Quit, GuardChoice::Cancel) => {
                self.quit_queue.clear();
                Vec::new()
            }
            (GuardAction::Quit, GuardChoice::DontSave) => {
                self.quit_queue.retain(|id| *id != guard.document_id);
                self.advance_quit()
            }
            (GuardAction::Quit, GuardChoice::Save) => {
                self.begin_save(guard.document_id, AfterWrite::Quit)
            }
        }
    }
}

fn paths_match(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        a.to_string_lossy()
            .eq_ignore_ascii_case(&b.to_string_lossy())
    } else {
        a == b
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| UNTITLED_NAME.to_owned())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    NewUntitled,
    Open,
    OpenPath(PathBuf),
    FileLoaded {
        path: PathBuf,
        content: String,
    },
    FileLoadFailed {
        path: PathBuf,
        error: ReadError,
    },
    SetMode(Mode),
    ToggleMode,
    ContentChanged {
        document_id: DocumentId,
        content: String,
    },
    ActivateTab(DocumentId),
    CloseTab(DocumentId),
    MoveTab {
        from: DocumentId,
        to: usize,
    },
    CycleTab(i32),
    Save,
    SaveAs,
    SaveAsChosen(PathBuf),
    SaveDialogCancelled,
    WriteSucceeded,
    WriteFailed(String),
    WindowCloseRequested,
    GuardChosen(GuardChoice),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    ShowOpenDialog,
    ReadFile(PathBuf),
    WriteFile { path: PathBuf, content: String },
    ShowSaveDialog { suggested_name: String },
    SetWindowTitle(String),
    ShowToast(String),
    CloseWindow,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loaded_workspace(name: &str, content: &str) -> Workspace {
        let mut workspace = Workspace::new();
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from(name),
            content: content.to_owned(),
        });
        workspace
    }

    fn edit(workspace: &mut Workspace, content: &str) {
        let id = workspace.active_document().unwrap().id;
        workspace.apply(Command::ContentChanged {
            document_id: id,
            content: content.to_owned(),
        });
    }

    #[test]
    fn file_launch_opens_preview_tab() {
        let path = PathBuf::from(r"C:\notes\ideas.md");
        let mut workspace = Workspace::new();

        let effects = workspace.apply(Command::OpenPath(path.clone()));
        assert_eq!(effects, vec![Effect::ReadFile(path.clone())]);

        let effects = workspace.apply(Command::FileLoaded {
            path: path.clone(),
            content: "# Ideas".to_owned(),
        });

        let document = workspace.active_document().expect("active document");
        assert_eq!(document.path.as_deref(), Some(path.as_path()));
        assert_eq!(document.content, "# Ideas");
        assert_eq!(document.saved_content, "# Ideas");
        assert_eq!(document.mode, Mode::Preview);
        assert!(!document.is_dirty());
        assert_eq!(workspace.tabs().len(), 1);
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle(
                "ideas.md — Markdown Hexer".to_owned()
            )]
        );
    }

    #[test]
    fn bare_launch_creates_an_untitled_document_in_edit() {
        let mut workspace = Workspace::new();

        let effects = workspace.apply(Command::NewUntitled);

        let document = workspace.active_document().expect("untitled document");
        assert_eq!(document.path, None);
        assert_eq!(document.content, "");
        assert_eq!(document.mode, Mode::Edit);
        assert_eq!(workspace.active_tab().unwrap().title(), "Untitled.md");
        assert_eq!(workspace.window_title(), "Untitled.md — Markdown Hexer");
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle(
                "Untitled.md — Markdown Hexer".to_owned()
            )]
        );
    }

    #[test]
    fn loading_a_file_replaces_an_empty_untitled_placeholder() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let placeholder_id = workspace.active_document().unwrap().id;

        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("notes.md"),
            content: "hello".to_owned(),
        });

        assert_eq!(workspace.tabs().len(), 1);
        let document = workspace.active_document().unwrap();
        assert_ne!(document.id, placeholder_id);
        assert_eq!(document.mode, Mode::Preview);
    }

    #[test]
    fn content_changes_are_dirty_and_bump_revision() {
        let mut workspace = loaded_workspace("notes.md", "before");
        assert_eq!(workspace.active_document().unwrap().revision, 0);

        let effects = workspace.apply(Command::ContentChanged {
            document_id: workspace.active_document().unwrap().id,
            content: "after".to_owned(),
        });

        let document = workspace.active_document().unwrap();
        assert!(document.is_dirty());
        assert_eq!(document.revision, 1);
        assert_eq!(document.content, "after");
        assert_eq!(workspace.active_tab().unwrap().title(), "notes.md *");
        assert_eq!(workspace.window_title(), "notes.md * — Markdown Hexer");
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle(
                "notes.md * — Markdown Hexer".to_owned()
            )]
        );

        workspace.apply(Command::ContentChanged {
            document_id: document.id,
            content: "after".to_owned(),
        });
        assert_eq!(workspace.active_document().unwrap().revision, 1);
    }

    #[test]
    fn set_mode_only_touches_the_active_document_and_toggle_flips() {
        let mut workspace = Workspace::new();
        assert!(workspace.apply(Command::SetMode(Mode::Edit)).is_empty());

        workspace = loaded_workspace("notes.md", "");
        workspace.apply(Command::SetMode(Mode::Edit));
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Edit);
        workspace.apply(Command::ToggleMode);
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Preview);
    }

    #[test]
    fn save_writes_the_document_and_success_cleans_it() {
        let mut workspace = loaded_workspace("notes.md", "before");
        edit(&mut workspace, "after");

        let effects = workspace.apply(Command::Save);
        assert_eq!(
            effects,
            vec![Effect::WriteFile {
                path: PathBuf::from("notes.md"),
                content: "after".to_owned(),
            }]
        );

        let effects = workspace.apply(Command::WriteSucceeded);
        assert!(!workspace.active_document().unwrap().is_dirty());
        assert_eq!(workspace.active_tab().unwrap().title(), "notes.md");
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle(
                "notes.md — Markdown Hexer".to_owned()
            )]
        );
    }

    #[test]
    fn failed_save_keeps_the_document_dirty_and_leaves_saved_content() {
        let mut workspace = loaded_workspace("notes.md", "before");
        edit(&mut workspace, "after");
        workspace.apply(Command::Save);

        let effects = workspace.apply(Command::WriteFailed("disk full".to_owned()));

        let document = workspace.active_document().unwrap();
        assert!(document.is_dirty());
        assert_eq!(document.saved_content, "before");
        assert_eq!(
            effects,
            vec![Effect::ShowToast(
                "Could not save notes.md: disk full".to_owned()
            )]
        );
    }

    #[test]
    fn save_on_clean_document_writes_nothing() {
        let mut workspace = loaded_workspace("notes.md", "same");
        assert!(workspace.apply(Command::Save).is_empty());
    }

    #[test]
    fn untitled_save_asks_for_a_path_even_when_empty() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);

        let effects = workspace.apply(Command::Save);

        assert_eq!(
            effects,
            vec![Effect::ShowSaveDialog {
                suggested_name: "Untitled.md".to_owned()
            }]
        );
        assert!(workspace.save_dialog_open());
    }

    #[test]
    fn untitled_save_asks_for_a_path_and_writes_there() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        edit(&mut workspace, "# New");

        let effects = workspace.apply(Command::Save);
        assert_eq!(
            effects,
            vec![Effect::ShowSaveDialog {
                suggested_name: "Untitled.md".to_owned()
            }]
        );
        assert!(workspace.save_dialog_open());

        let effects = workspace.apply(Command::SaveAsChosen(PathBuf::from("new.md")));
        assert_eq!(
            effects,
            vec![Effect::WriteFile {
                path: PathBuf::from("new.md"),
                content: "# New".to_owned(),
            }]
        );

        workspace.apply(Command::WriteSucceeded);
        let document = workspace.active_document().unwrap();
        assert_eq!(document.path.as_deref(), Some(Path::new("new.md")));
        assert!(!document.is_dirty());
        assert_eq!(workspace.window_title(), "new.md — Markdown Hexer");
        assert_eq!(document.mode, Mode::Edit);
        assert_eq!(document.image_scope(), Some(Path::new("")));
    }

    #[test]
    fn save_as_updates_path_title_image_scope_and_keeps_mode() {
        let mut workspace = loaded_workspace("old/notes.md", "text");
        workspace.apply(Command::SetMode(Mode::Edit));

        workspace.apply(Command::SaveAs);
        workspace.apply(Command::SaveAsChosen(PathBuf::from("new/place.md")));
        workspace.apply(Command::WriteSucceeded);

        let document = workspace.active_document().unwrap();
        assert_eq!(document.path.as_deref(), Some(Path::new("new/place.md")));
        assert_eq!(document.mode, Mode::Edit);
        assert_eq!(document.image_scope(), Some(Path::new("new")));
        assert_eq!(workspace.window_title(), "place.md — Markdown Hexer");
    }

    #[test]
    fn save_as_dialog_cancel_keeps_the_document_untouched() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        edit(&mut workspace, "draft");
        workspace.apply(Command::Save);

        assert!(workspace.apply(Command::SaveDialogCancelled).is_empty());
        assert!(!workspace.save_dialog_open());
        assert_eq!(workspace.active_document().unwrap().path, None);
        assert!(workspace.active_document().unwrap().is_dirty());
    }

    #[test]
    fn save_as_rejects_a_path_open_in_another_tab() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("other.md"),
            content: "other".to_owned(),
        });
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("notes.md"),
            content: "notes".to_owned(),
        });

        workspace.apply(Command::SaveAs);
        let effects = workspace.apply(Command::SaveAsChosen(PathBuf::from("other.md")));

        assert_eq!(
            effects,
            vec![Effect::ShowToast("other.md is already open".to_owned())]
        );
    }

    #[test]
    fn failed_load_keeps_the_current_document_and_toasts() {
        let mut workspace = loaded_workspace("notes.md", "keep me");
        let effects = workspace.apply(Command::FileLoadFailed {
            path: PathBuf::from("broken.md"),
            error: ReadError::NotUtf8,
        });

        assert_eq!(
            effects,
            vec![Effect::ShowToast(
                "Could not open broken.md: not valid UTF-8".to_owned()
            )]
        );
        assert_eq!(workspace.active_document().unwrap().content, "keep me");
        assert_eq!(workspace.window_title(), "notes.md — Markdown Hexer");
    }

    #[test]
    fn close_guard_appears_only_for_dirty_documents() {
        let mut workspace = loaded_workspace("notes.md", "clean");
        assert_eq!(
            workspace.apply(Command::WindowCloseRequested),
            vec![Effect::CloseWindow]
        );

        edit(&mut workspace, "dirty");
        assert!(workspace.apply(Command::WindowCloseRequested).is_empty());
        assert_eq!(workspace.guard().unwrap().title, "notes.md *");

        // A repeat close request must not replace or stack the Guard.
        assert!(workspace.apply(Command::WindowCloseRequested).is_empty());
        assert_eq!(workspace.guard().unwrap().title, "notes.md *");
    }

    #[test]
    fn guard_dont_save_closes_and_cancel_keeps_open() {
        let mut workspace = loaded_workspace("notes.md", "clean");
        edit(&mut workspace, "dirty");
        workspace.apply(Command::WindowCloseRequested);

        assert!(
            workspace
                .apply(Command::GuardChosen(GuardChoice::Cancel))
                .is_empty()
        );
        assert!(workspace.guard().is_none());
        assert_eq!(workspace.active_document().unwrap().content, "dirty");

        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(
            workspace.apply(Command::GuardChosen(GuardChoice::DontSave)),
            vec![Effect::CloseWindow]
        );
    }

    #[test]
    fn guard_save_writes_then_closes_on_success() {
        let mut workspace = loaded_workspace("notes.md", "clean");
        edit(&mut workspace, "dirty");
        workspace.apply(Command::WindowCloseRequested);

        let effects = workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert_eq!(
            effects,
            vec![Effect::WriteFile {
                path: PathBuf::from("notes.md"),
                content: "dirty".to_owned(),
            }]
        );

        assert_eq!(
            workspace.apply(Command::WriteSucceeded),
            vec![
                Effect::SetWindowTitle("notes.md — Markdown Hexer".to_owned()),
                Effect::CloseWindow,
            ]
        );
    }

    #[test]
    fn guard_save_failure_keeps_the_window_open() {
        let mut workspace = loaded_workspace("notes.md", "clean");
        edit(&mut workspace, "dirty");
        workspace.apply(Command::WindowCloseRequested);
        workspace.apply(Command::GuardChosen(GuardChoice::Save));

        let effects = workspace.apply(Command::WriteFailed("denied".to_owned()));
        assert_eq!(
            effects,
            vec![Effect::ShowToast(
                "Could not save notes.md: denied".to_owned()
            )]
        );
        assert!(workspace.active_document().unwrap().is_dirty());
    }

    #[test]
    fn guard_save_on_untitled_asks_for_a_path_then_closes_after_success() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        edit(&mut workspace, "draft");
        workspace.apply(Command::WindowCloseRequested);

        let effects = workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert_eq!(
            effects,
            vec![Effect::ShowSaveDialog {
                suggested_name: "Untitled.md".to_owned()
            }]
        );
        assert!(workspace.guard().is_none());

        workspace.apply(Command::SaveAsChosen(PathBuf::from("draft.md")));
        assert_eq!(
            workspace.apply(Command::WriteSucceeded),
            vec![
                Effect::SetWindowTitle("draft.md — Markdown Hexer".to_owned()),
                Effect::CloseWindow,
            ]
        );
    }

    #[test]
    fn guard_save_on_untitled_dialog_cancel_keeps_the_window_open() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        edit(&mut workspace, "draft");
        workspace.apply(Command::WindowCloseRequested);

        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert!(workspace.apply(Command::SaveDialogCancelled).is_empty());
        assert_eq!(workspace.active_document().unwrap().path, None);
    }

    fn tab_ids(workspace: &Workspace) -> Vec<DocumentId> {
        workspace.tabs().iter().map(|tab| tab.document.id).collect()
    }

    fn workspace_with_files(names: &[&str]) -> (Workspace, Vec<DocumentId>) {
        let mut workspace = Workspace::new();
        let mut ids = Vec::new();
        for name in names {
            workspace.apply(Command::FileLoaded {
                path: PathBuf::from(name),
                content: (*name).to_owned(),
            });
            ids.push(workspace.active_document().unwrap().id);
        }
        (workspace, ids)
    }

    fn edit_document(workspace: &mut Workspace, document_id: DocumentId, content: &str) {
        workspace.apply(Command::ContentChanged {
            document_id,
            content: content.to_owned(),
        });
    }

    #[test]
    fn new_tabs_insert_after_active_and_number_past_highest_untitled() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let first = workspace.active_document().unwrap().id;
        assert_eq!(
            workspace.active_document().unwrap().untitled_number,
            Some(1)
        );
        assert_eq!(workspace.active_tab().unwrap().title(), "Untitled.md");

        workspace.apply(Command::NewUntitled);
        let second = workspace.active_document().unwrap().id;
        assert_eq!(
            workspace.active_document().unwrap().untitled_number,
            Some(2)
        );
        assert_eq!(workspace.active_tab().unwrap().title(), "Untitled 2.md");
        assert_eq!(tab_ids(&workspace), vec![first, second]);

        workspace.apply(Command::ActivateTab(first));
        workspace.apply(Command::NewUntitled);
        let third = workspace.active_document().unwrap().id;
        assert_eq!(
            workspace.active_document().unwrap().untitled_number,
            Some(3)
        );
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Edit);
        assert_eq!(tab_ids(&workspace), vec![first, third, second]);
    }

    #[test]
    fn save_as_clears_the_untitled_number_so_new_can_reuse_it() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        workspace.apply(Command::NewUntitled);
        edit(&mut workspace, "two");

        workspace.apply(Command::Save);
        workspace.apply(Command::SaveAsChosen(PathBuf::from("two.md")));
        workspace.apply(Command::WriteSucceeded);

        assert_eq!(workspace.active_document().unwrap().untitled_number, None);
        workspace.apply(Command::NewUntitled);
        assert_eq!(
            workspace.active_document().unwrap().untitled_number,
            Some(2)
        );
        assert_eq!(workspace.active_tab().unwrap().title(), "Untitled 2.md");
    }

    #[test]
    fn open_focuses_an_existing_tab_without_reading_again() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);

        let effects = workspace.apply(Command::OpenPath(PathBuf::from("a.md")));

        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle("a.md — Markdown Hexer".to_owned())]
        );
        assert_eq!(workspace.active_document().unwrap().id, ids[0]);
        assert_eq!(workspace.tabs().len(), 2);
    }

    #[test]
    fn open_inserts_a_new_tab_after_active() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);
        workspace.apply(Command::ActivateTab(ids[0]));

        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("c.md"),
            content: "c".to_owned(),
        });

        let inserted = workspace.active_document().unwrap().id;
        assert_eq!(tab_ids(&workspace), vec![ids[0], inserted, ids[1]]);
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Preview);
    }

    #[test]
    fn open_keeps_a_non_empty_untitled_tab() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let draft = workspace.active_document().unwrap().id;
        edit(&mut workspace, "draft");

        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("notes.md"),
            content: "notes".to_owned(),
        });

        assert_eq!(workspace.tabs().len(), 2);
        assert_eq!(workspace.document(draft).unwrap().content, "draft");
        assert_eq!(workspace.active_document().unwrap().file_name(), "notes.md");
    }

    #[test]
    fn one_tab_per_canonical_path_is_case_insensitive_only_on_windows() {
        let mut workspace = loaded_workspace(r"C:\Docs\Notes.md", "first");
        let first = workspace.active_document().unwrap().id;

        workspace.apply(Command::FileLoaded {
            path: PathBuf::from(r"c:\docs\NOTES.md"),
            content: "second".to_owned(),
        });

        if cfg!(windows) {
            assert_eq!(workspace.tabs().len(), 1);
            assert_eq!(workspace.active_document().unwrap().id, first);
            assert_eq!(workspace.active_document().unwrap().content, "first");
        } else {
            assert_eq!(workspace.tabs().len(), 2);
            assert_eq!(workspace.active_document().unwrap().content, "second");
        }
    }

    #[test]
    fn closing_the_active_tab_activates_the_right_neighbor_or_new_last() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        workspace.apply(Command::ActivateTab(ids[1]));

        let effects = workspace.apply(Command::CloseTab(ids[1]));
        assert_eq!(tab_ids(&workspace), vec![ids[0], ids[2]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[2]);
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle("c.md — Markdown Hexer".to_owned())]
        );

        workspace.apply(Command::CloseTab(ids[2]));
        assert_eq!(tab_ids(&workspace), vec![ids[0]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[0]);
    }

    #[test]
    fn closing_a_background_tab_leaves_active_alone() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        workspace.apply(Command::ActivateTab(ids[1]));

        workspace.apply(Command::CloseTab(ids[0]));
        assert_eq!(tab_ids(&workspace), vec![ids[1], ids[2]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[1]);

        workspace.apply(Command::CloseTab(ids[2]));
        assert_eq!(tab_ids(&workspace), vec![ids[1]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[1]);
    }

    #[test]
    fn closing_the_last_tab_closes_the_window() {
        let mut workspace = loaded_workspace("a.md", "a");
        let id = workspace.active_document().unwrap().id;

        assert_eq!(
            workspace.apply(Command::CloseTab(id)),
            vec![Effect::CloseWindow]
        );
        assert_eq!(workspace.tabs().len(), 1);
    }

    #[test]
    fn moving_tabs_keeps_the_active_document() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        workspace.apply(Command::ActivateTab(ids[2]));

        assert!(
            workspace
                .apply(Command::MoveTab {
                    from: ids[0],
                    to: 2
                })
                .is_empty()
        );
        assert_eq!(tab_ids(&workspace), vec![ids[1], ids[2], ids[0]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[2]);

        workspace.apply(Command::MoveTab {
            from: ids[2],
            to: 0,
        });
        assert_eq!(tab_ids(&workspace), vec![ids[2], ids[1], ids[0]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[2]);
    }

    #[test]
    fn cycling_tabs_wraps_and_leaves_a_single_tab_alone() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        workspace.apply(Command::ActivateTab(ids[0]));

        workspace.apply(Command::CycleTab(1));
        assert_eq!(workspace.active_document().unwrap().id, ids[1]);
        workspace.apply(Command::CycleTab(1));
        assert_eq!(workspace.active_document().unwrap().id, ids[2]);
        workspace.apply(Command::CycleTab(1));
        assert_eq!(workspace.active_document().unwrap().id, ids[0]);
        workspace.apply(Command::CycleTab(-1));
        assert_eq!(workspace.active_document().unwrap().id, ids[2]);

        workspace.apply(Command::CloseTab(ids[0]));
        workspace.apply(Command::CloseTab(ids[1]));
        let only = workspace.active_document().unwrap().id;
        assert!(workspace.apply(Command::CycleTab(1)).is_empty());
        assert_eq!(workspace.active_document().unwrap().id, only);
    }

    #[test]
    fn each_tab_keeps_its_own_mode() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);
        workspace.apply(Command::SetMode(Mode::Edit));
        workspace.apply(Command::ActivateTab(ids[0]));
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Preview);
        assert_eq!(workspace.document(ids[1]).unwrap().mode, Mode::Edit);
    }

    #[test]
    fn tab_labels_add_the_parent_folder_only_on_a_basename_collision() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("left/notes.md"),
            content: "left".to_owned(),
        });
        let left = workspace.active_document().unwrap().id;
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("right/notes.md"),
            content: "right".to_owned(),
        });
        let right = workspace.active_document().unwrap().id;

        assert_eq!(workspace.tab_label(left), "notes.md — left");
        assert_eq!(workspace.tab_label(right), "notes.md — right");

        edit_document(&mut workspace, left, "changed");
        assert_eq!(workspace.tab_label(left), "notes.md * — left");

        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("solo.md"),
            content: String::new(),
        });
        assert_eq!(
            workspace.tab_label(workspace.active_document().unwrap().id),
            "solo.md"
        );

        let root = if cfg!(windows) {
            PathBuf::from(r"C:\root.md")
        } else {
            PathBuf::from("/root.md")
        };
        workspace.apply(Command::FileLoaded {
            path: root,
            content: String::new(),
        });
        assert_eq!(
            workspace.tab_label(workspace.active_document().unwrap().id),
            "root.md"
        );

        workspace.apply(Command::NewUntitled);
        assert_eq!(
            workspace.tab_label(workspace.active_document().unwrap().id),
            "Untitled.md"
        );
    }

    #[test]
    fn closing_a_dirty_tab_saves_only_that_tab_then_closes_it() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);
        edit_document(&mut workspace, ids[0], "changed");

        assert!(workspace.apply(Command::CloseTab(ids[0])).is_empty());
        let guard = workspace.guard().unwrap();
        assert_eq!(guard.document_id, ids[0]);
        assert_eq!(guard.action, GuardAction::CloseTab);
        assert_eq!(guard.title, "a.md *");

        assert_eq!(
            workspace.apply(Command::GuardChosen(GuardChoice::Save)),
            vec![Effect::WriteFile {
                path: PathBuf::from("a.md"),
                content: "changed".to_owned(),
            }]
        );
        assert_eq!(
            workspace.apply(Command::WriteSucceeded),
            vec![Effect::SetWindowTitle("b.md — Markdown Hexer".to_owned())]
        );
        assert_eq!(tab_ids(&workspace), vec![ids[1]]);
        assert_eq!(workspace.active_document().unwrap().id, ids[1]);
    }

    #[test]
    fn close_guard_cancel_and_save_failure_keep_the_tab() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);
        edit_document(&mut workspace, ids[0], "changed");

        workspace.apply(Command::CloseTab(ids[0]));
        workspace.apply(Command::GuardChosen(GuardChoice::Cancel));
        assert_eq!(workspace.tabs().len(), 2);
        assert!(workspace.guard().is_none());

        workspace.apply(Command::CloseTab(ids[0]));
        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        let effects = workspace.apply(Command::WriteFailed("denied".to_owned()));
        assert_eq!(
            effects,
            vec![Effect::ShowToast("Could not save a.md: denied".to_owned())]
        );
        assert_eq!(workspace.tabs().len(), 2);
        assert!(workspace.document(ids[0]).unwrap().is_dirty());
    }

    #[test]
    fn close_guard_dont_save_drops_the_tab_and_last_tab_closes_window() {
        let mut workspace = loaded_workspace("a.md", "a");
        let id = workspace.active_document().unwrap().id;
        edit(&mut workspace, "changed");

        workspace.apply(Command::CloseTab(id));
        assert_eq!(
            workspace.apply(Command::GuardChosen(GuardChoice::DontSave)),
            vec![Effect::CloseWindow]
        );
        assert!(workspace.guard().is_none());
    }

    #[test]
    fn quit_guards_each_dirty_tab_in_tab_order_then_closes() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        edit_document(&mut workspace, ids[0], "a changed");
        edit_document(&mut workspace, ids[2], "c changed");

        assert!(workspace.apply(Command::WindowCloseRequested).is_empty());
        let guard = workspace.guard().unwrap();
        assert_eq!(guard.document_id, ids[0]);
        assert_eq!(guard.action, GuardAction::Quit);

        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        let effects = workspace.apply(Command::WriteSucceeded);
        assert_eq!(
            effects,
            vec![Effect::SetWindowTitle("c.md * — Markdown Hexer".to_owned())]
        );
        assert_eq!(workspace.guard().unwrap().document_id, ids[2]);

        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert_eq!(
            workspace.apply(Command::WriteSucceeded),
            vec![
                Effect::SetWindowTitle("c.md — Markdown Hexer".to_owned()),
                Effect::CloseWindow,
            ]
        );
        assert!(workspace.guard().is_none());
    }

    #[test]
    fn quit_dont_save_skips_that_tab_and_continues() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md", "c.md"]);
        edit_document(&mut workspace, ids[0], "a changed");
        edit_document(&mut workspace, ids[2], "c changed");

        workspace.apply(Command::WindowCloseRequested);
        workspace.apply(Command::GuardChosen(GuardChoice::DontSave));
        assert_eq!(workspace.guard().unwrap().document_id, ids[2]);

        assert_eq!(
            workspace.apply(Command::GuardChosen(GuardChoice::DontSave)),
            vec![Effect::CloseWindow]
        );
    }

    #[test]
    fn quit_cancel_or_save_failure_aborts_the_whole_quit() {
        let (mut workspace, ids) = workspace_with_files(&["a.md", "b.md"]);
        edit_document(&mut workspace, ids[0], "a changed");
        edit_document(&mut workspace, ids[1], "b changed");

        workspace.apply(Command::WindowCloseRequested);
        assert!(
            workspace
                .apply(Command::GuardChosen(GuardChoice::Cancel))
                .is_empty()
        );
        assert!(workspace.guard().is_none());
        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(workspace.guard().unwrap().document_id, ids[0]);

        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert_eq!(
            workspace.apply(Command::WriteFailed("denied".to_owned())),
            vec![Effect::ShowToast("Could not save a.md: denied".to_owned())]
        );
        assert!(workspace.guard().is_none());
        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(workspace.guard().unwrap().document_id, ids[0]);
    }

    #[test]
    fn quit_with_no_dirty_tabs_closes_without_a_guard() {
        let (mut workspace, _) = workspace_with_files(&["a.md", "b.md"]);
        assert_eq!(
            workspace.apply(Command::WindowCloseRequested),
            vec![Effect::CloseWindow]
        );
        assert!(workspace.guard().is_none());
    }

    #[test]
    fn quit_save_as_targets_the_guard_tab_not_the_active_tab() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let draft = workspace.active_document().unwrap().id;
        edit(&mut workspace, "draft");
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("notes.md"),
            content: "notes".to_owned(),
        });

        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(workspace.guard().unwrap().document_id, draft);
        assert_eq!(
            workspace.apply(Command::GuardChosen(GuardChoice::Save)),
            vec![Effect::ShowSaveDialog {
                suggested_name: "Untitled.md".to_owned()
            }]
        );
        assert_eq!(
            workspace.apply(Command::SaveAsChosen(PathBuf::from("draft.md"))),
            vec![Effect::WriteFile {
                path: PathBuf::from("draft.md"),
                content: "draft".to_owned(),
            }]
        );
        assert_eq!(
            workspace.apply(Command::WriteSucceeded),
            vec![
                Effect::SetWindowTitle("notes.md — Markdown Hexer".to_owned()),
                Effect::CloseWindow,
            ]
        );
        let document = workspace.document(draft).unwrap();
        assert_eq!(document.path.as_deref(), Some(Path::new("draft.md")));
        assert_eq!(document.untitled_number, None);
        assert_eq!(workspace.active_document().unwrap().file_name(), "notes.md");
    }

    #[test]
    fn save_as_to_the_same_tabs_path_is_allowed() {
        let mut workspace = loaded_workspace("a.md", "before");
        edit(&mut workspace, "after");

        workspace.apply(Command::SaveAs);
        assert_eq!(
            workspace.apply(Command::SaveAsChosen(PathBuf::from("a.md"))),
            vec![Effect::WriteFile {
                path: PathBuf::from("a.md"),
                content: "after".to_owned(),
            }]
        );
        workspace.apply(Command::WriteSucceeded);
        assert!(!workspace.active_document().unwrap().is_dirty());
        assert_eq!(
            workspace.active_document().unwrap().path.as_deref(),
            Some(Path::new("a.md"))
        );
    }

    #[test]
    fn save_as_collision_while_quitting_aborts_the_quit() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let draft = workspace.active_document().unwrap().id;
        edit(&mut workspace, "draft");
        workspace.apply(Command::FileLoaded {
            path: PathBuf::from("notes.md"),
            content: "notes".to_owned(),
        });
        let notes = workspace.active_document().unwrap().id;
        edit_document(&mut workspace, notes, "changed");

        workspace.apply(Command::WindowCloseRequested);
        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert_eq!(
            workspace.apply(Command::SaveAsChosen(PathBuf::from("notes.md"))),
            vec![Effect::ShowToast("notes.md is already open".to_owned())]
        );
        assert!(workspace.guard().is_none());
        assert!(workspace.document(draft).unwrap().is_dirty());
        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(workspace.guard().unwrap().document_id, draft);
    }

    #[test]
    fn save_as_dialog_cancel_while_quitting_aborts_the_quit() {
        let mut workspace = Workspace::new();
        workspace.apply(Command::NewUntitled);
        let draft = workspace.active_document().unwrap().id;
        edit(&mut workspace, "draft");

        workspace.apply(Command::WindowCloseRequested);
        workspace.apply(Command::GuardChosen(GuardChoice::Save));
        assert!(workspace.apply(Command::SaveDialogCancelled).is_empty());
        assert!(workspace.guard().is_none());
        workspace.apply(Command::WindowCloseRequested);
        assert_eq!(workspace.guard().unwrap().document_id, draft);
    }
}
