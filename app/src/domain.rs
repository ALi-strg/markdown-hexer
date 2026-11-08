use std::path::{Path, PathBuf};

use crate::platform::ReadError;

pub const APP_NAME: &str = "Markdown Hexer";
pub const UNTITLED_NAME: &str = "Untitled.md";

/// A Document's view mode. Ticket 02 only opens Documents in Preview.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Preview,
    Edit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    pub path: PathBuf,
    pub content: String,
    pub saved_content: String,
    pub mode: Mode,
}

impl Document {
    pub fn new(path: PathBuf, content: String) -> Self {
        Self {
            path,
            saved_content: content.clone(),
            content,
            mode: Mode::Preview,
        }
    }

    pub fn is_dirty(&self) -> bool {
        self.content != self.saved_content
    }

    pub fn file_name(&self) -> String {
        file_name(&self.path)
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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Workspace {
    tabs: Vec<Tab>,
    active: Option<usize>,
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

    /// `<filename> — Markdown Hexer`, with `*` after a dirty filename.
    pub fn window_title(&self) -> String {
        match self.active_tab() {
            Some(tab) => format!("{} — {APP_NAME}", tab.title()),
            None => APP_NAME.to_owned(),
        }
    }

    pub fn apply(&mut self, command: Command) -> Vec<Effect> {
        match command {
            Command::OpenPath(path) => vec![Effect::ReadFile(path)],
            Command::FileLoaded { path, content } => {
                self.tabs.push(Tab {
                    document: Document::new(path, content),
                });
                self.active = Some(self.tabs.len() - 1);
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
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    OpenPath(PathBuf),
    FileLoaded { path: PathBuf, content: String },
    FileLoadFailed { path: PathBuf, error: ReadError },
    SetMode(Mode),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    ReadFile(PathBuf),
    SetWindowTitle(String),
    ShowToast(String),
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| UNTITLED_NAME.to_owned())
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
        assert_eq!(document.path, path);
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
    fn bare_launch_has_no_tab_and_plain_title() {
        let workspace = Workspace::new();

        assert!(workspace.tabs().is_empty());
        assert!(workspace.active_document().is_none());
        assert_eq!(workspace.window_title(), "Markdown Hexer");
    }

    #[test]
    fn window_title_marks_dirty_documents() {
        let mut workspace = loaded_workspace("notes.md", "before");
        assert_eq!(workspace.window_title(), "notes.md — Markdown Hexer");

        workspace.active_document_mut().unwrap().content = "after".to_owned();

        assert_eq!(workspace.active_tab().unwrap().title(), "notes.md *");
        assert_eq!(workspace.window_title(), "notes.md * — Markdown Hexer");
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
    fn set_mode_only_touches_the_active_document() {
        let mut workspace = Workspace::new();
        assert!(workspace.apply(Command::SetMode(Mode::Edit)).is_empty());

        workspace = loaded_workspace("notes.md", "");
        workspace.apply(Command::SetMode(Mode::Edit));
        assert_eq!(workspace.active_document().unwrap().mode, Mode::Edit);
    }
}
