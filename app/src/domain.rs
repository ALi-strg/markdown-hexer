use std::path::{Path, PathBuf};

use crate::platform::ReadError;

pub const APP_NAME: &str = "Markdown Hexer";
pub const UNTITLED_NAME: &str = "Untitled.md";

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
            saved_content: content.clone(),
            content,
            mode: Mode::Preview,
            revision: 0,
        }
    }

    /// A bare launch starts in Edit so the user can type immediately.
    pub fn untitled(id: DocumentId) -> Self {
        Self {
            id,
            path: None,
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
            .unwrap_or_else(|| UNTITLED_NAME.to_owned())
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

/// The app-modal close Guard is showing for this Document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuardState {
    pub document_id: DocumentId,
    pub title: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SaveDialogState {
    close_after: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingWrite {
    document_id: DocumentId,
    path: PathBuf,
    /// Content actually handed to the filesystem. The Document's saved content
    /// becomes this, so an edit made mid-write stays Dirty.
    content: String,
    save_as: bool,
    close_after: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Workspace {
    tabs: Vec<Tab>,
    active: Option<usize>,
    next_id: DocumentId,
    guard: Option<GuardState>,
    save_dialog: Option<SaveDialogState>,
    pending_write: Option<PendingWrite>,
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
            Command::NewUntitled => {
                let id = self.allocate_id();
                self.tabs.push(Tab {
                    document: Document::untitled(id),
                });
                self.active = Some(self.tabs.len() - 1);
                vec![Effect::SetWindowTitle(self.window_title())]
            }
            Command::OpenPath(path) => vec![Effect::ReadFile(path)],
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
            Command::Save => match self.active_document().map(|document| document.id) {
                Some(id) => self.begin_save(id, false),
                None => Vec::new(),
            },
            Command::SaveAs => match self.active_document().map(|document| document.id) {
                Some(id) => self.begin_save_as(id, false),
                None => Vec::new(),
            },
            Command::SaveAsChosen(path) => self.save_as_chosen(path),
            Command::SaveDialogCancelled => {
                self.save_dialog = None;
                Vec::new()
            }
            Command::WriteSucceeded => self.write_succeeded(),
            Command::WriteFailed(message) => self.write_failed(&message),
            Command::WindowCloseRequested => self.window_close_requested(),
            Command::GuardChosen(choice) => self.guard_chosen(choice),
        }
    }

    fn allocate_id(&mut self) -> DocumentId {
        self.next_id += 1;
        self.next_id
    }

    fn load_document(&mut self, path: PathBuf, content: String) {
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
            self.tabs.push(Tab { document });
            self.active = Some(self.tabs.len() - 1);
        }
    }

    fn begin_save(&mut self, document_id: DocumentId, close_after: bool) -> Vec<Effect> {
        if self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        let Some(document) = self.document(document_id) else {
            return Vec::new();
        };
        if document.path.is_none() {
            return self.open_save_dialog(document_id, close_after);
        }
        if !document.is_dirty() {
            return if close_after {
                vec![Effect::CloseWindow]
            } else {
                Vec::new()
            };
        }
        match document.path.clone() {
            Some(path) => self.queue_write(document.id, path, false, close_after),
            None => self.open_save_dialog(document_id, close_after),
        }
    }

    fn begin_save_as(&mut self, document_id: DocumentId, close_after: bool) -> Vec<Effect> {
        if self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        if self.document(document_id).is_none() {
            return Vec::new();
        }
        self.open_save_dialog(document_id, close_after)
    }

    fn open_save_dialog(&mut self, document_id: DocumentId, close_after: bool) -> Vec<Effect> {
        let Some(document) = self.document(document_id) else {
            return Vec::new();
        };
        let suggested_name = document.file_name();
        self.save_dialog = Some(SaveDialogState { close_after });
        vec![Effect::ShowSaveDialog { suggested_name }]
    }

    fn save_as_chosen(&mut self, path: PathBuf) -> Vec<Effect> {
        let Some(dialog) = self.save_dialog.take() else {
            return Vec::new();
        };
        let Some(active) = self.active_document() else {
            return Vec::new();
        };
        let document_id = active.id;
        let duplicate = self.tabs.iter().any(|tab| {
            tab.document.id != document_id
                && tab
                    .document
                    .path
                    .as_deref()
                    .is_some_and(|other| paths_match(other, &path))
        });
        if duplicate {
            return vec![Effect::ShowToast(format!(
                "{} is already open",
                file_name(&path)
            ))];
        }
        self.queue_write(document_id, path, true, dialog.close_after)
    }

    fn queue_write(
        &mut self,
        document_id: DocumentId,
        path: PathBuf,
        save_as: bool,
        close_after: bool,
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
            close_after,
        });
        vec![Effect::WriteFile { path, content }]
    }

    fn write_succeeded(&mut self) -> Vec<Effect> {
        let Some(write) = self.pending_write.take() else {
            return Vec::new();
        };
        let Some(document) = self
            .tabs
            .iter_mut()
            .map(|tab| &mut tab.document)
            .find(|document| document.id == write.document_id)
        else {
            return Vec::new();
        };
        document.saved_content = write.content;
        if write.save_as {
            document.path = Some(write.path);
        }
        let mut effects = vec![Effect::SetWindowTitle(self.window_title())];
        if write.close_after {
            effects.push(Effect::CloseWindow);
        }
        effects
    }

    fn write_failed(&mut self, message: &str) -> Vec<Effect> {
        let Some(write) = self.pending_write.take() else {
            return Vec::new();
        };
        vec![Effect::ShowToast(format!(
            "Could not save {}: {message}",
            file_name(&write.path)
        ))]
    }

    fn window_close_requested(&mut self) -> Vec<Effect> {
        // The Guard is already app-modal; a second close request must not stack it.
        if self.guard.is_some() || self.save_dialog.is_some() || self.pending_write.is_some() {
            return Vec::new();
        }
        let Some(tab) = self.active_tab() else {
            return vec![Effect::CloseWindow];
        };
        if tab.document.is_dirty() {
            self.guard = Some(GuardState {
                document_id: tab.document.id,
                title: tab.title(),
            });
            Vec::new()
        } else {
            vec![Effect::CloseWindow]
        }
    }

    fn guard_chosen(&mut self, choice: GuardChoice) -> Vec<Effect> {
        let Some(guard) = self.guard.take() else {
            return Vec::new();
        };
        match choice {
            GuardChoice::DontSave => vec![Effect::CloseWindow],
            GuardChoice::Cancel => Vec::new(),
            GuardChoice::Save => self.begin_save(guard.document_id, true),
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
}
