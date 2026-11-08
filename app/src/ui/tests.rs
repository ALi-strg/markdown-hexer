use super::*;
use crate::domain::{Command, Mode};
use crate::platform::{ReadError, WriteError};
use crate::startup;
use egui::accesskit::Role;
use egui_kittest::Harness;
use egui_kittest::kittest::Queryable;
use std::cell::{Cell, RefCell};
use std::path::PathBuf;
use std::rc::Rc;

#[derive(Clone, Default)]
struct MemoryFiles {
    files: Rc<RefCell<HashMap<PathBuf, String>>>,
    fail_writes: Rc<Cell<bool>>,
}

impl MemoryFiles {
    fn insert(&self, path: impl Into<PathBuf>, content: &str) {
        self.files
            .borrow_mut()
            .insert(path.into(), content.to_owned());
    }

    fn written(&self, path: impl Into<PathBuf>) -> Option<String> {
        self.files.borrow().get(&path.into()).cloned()
    }
}

impl FileSystem for MemoryFiles {
    fn read_utf8(&self, path: &std::path::Path) -> Result<String, ReadError> {
        self.files
            .borrow()
            .get(path)
            .cloned()
            .ok_or(ReadError::NotFound)
    }

    fn write_utf8(&self, path: &std::path::Path, content: &str) -> Result<(), WriteError> {
        if self.fail_writes.get() {
            return Err(WriteError::Io("disk full".to_owned()));
        }
        self.files
            .borrow_mut()
            .insert(path.to_path_buf(), content.to_owned());
        Ok(())
    }

    fn canonicalize(&self, path: &std::path::Path) -> PathBuf {
        path.to_path_buf()
    }
}

#[derive(Clone, Default)]
struct FakeDialogs {
    next: Rc<RefCell<Option<PathBuf>>>,
}

impl FakeDialogs {
    fn returning(path: impl Into<PathBuf>) -> Self {
        Self {
            next: Rc::new(RefCell::new(Some(path.into()))),
        }
    }
}

impl Dialogs for FakeDialogs {
    fn save_as(&self, _suggested_name: &str) -> Option<PathBuf> {
        self.next.borrow_mut().take()
    }
}

fn harness(app: HexerApp) -> Harness<'static, HexerApp> {
    Harness::builder()
        .with_size(egui::vec2(900.0, 700.0))
        .build_eframe(|_cc| app)
}

fn file_app(
    path: impl Into<PathBuf>,
    content: &str,
    files: &MemoryFiles,
    dialogs: FakeDialogs,
) -> HexerApp {
    let path = path.into();
    files.insert(path.clone(), content);
    let startup = startup::launch(Some(path), files);
    HexerApp::with_platform(
        startup,
        Instant::now(),
        Box::new(files.clone()),
        Box::new(dialogs),
    )
}

fn untitled_app(files: &MemoryFiles, dialogs: FakeDialogs) -> HexerApp {
    HexerApp::with_platform(
        startup::launch(None, files),
        Instant::now(),
        Box::new(files.clone()),
        Box::new(dialogs),
    )
}

fn notes_path() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(r"D:\docs\notes.md")
    } else {
        PathBuf::from("/docs/notes.md")
    }
}

fn document_content(h: &Harness<'static, HexerApp>) -> String {
    h.state()
        .workspace
        .active_document()
        .unwrap()
        .content
        .clone()
}

#[test]
fn file_launch_starts_in_preview_without_editor_state() {
    let files = MemoryFiles::default();
    let app = file_app(
        notes_path(),
        "# Notes\n\nHello.",
        &files,
        FakeDialogs::default(),
    );

    assert!(app.editor.is_none());
    assert!(app.editor_sessions.is_empty());

    let h = harness(app);
    h.get_by_label("notes.md");
    assert!(h.query_by_role(Role::MultilineTextInput).is_none());
}

#[test]
fn bare_launch_starts_in_edit_with_an_editor() {
    let files = MemoryFiles::default();
    let app = untitled_app(&files, FakeDialogs::default());

    assert!(app.editor.is_some());
    assert_eq!(
        app.workspace
            .active_document()
            .map(|document| document.mode),
        Some(Mode::Edit)
    );

    let h = harness(app);
    h.get_by_label("Untitled.md");
    h.get_by_role(Role::MultilineTextInput);
}

#[test]
fn paste_goes_through_the_editor_and_undo_restores_it() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Paste("pasted text".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "pasted text");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "");
}

#[test]
fn mode_switcher_toggles_and_builds_the_editor_once() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\nHello.",
        &files,
        FakeDialogs::default(),
    ));

    h.get_by_label("Edit").click();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Edit)
    );
    assert!(h.state().editor.is_some());
    h.get_by_role(Role::MultilineTextInput);

    h.get_by_label("Preview").click();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );
    assert!(h.query_by_role(Role::MultilineTextInput).is_none());
}

#[test]
fn cmd_e_toggles_mode() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));

    h.key_press_modifiers(Modifiers::COMMAND, Key::E);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Edit)
    );

    h.key_press_modifiers(Modifiers::COMMAND, Key::E);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );
}

#[test]
fn typing_marks_the_document_dirty_and_shows_the_star() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();

    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .map(|document| document.content.as_str()),
        Some("hello")
    );
    assert!(
        h.state()
            .workspace
            .active_tab()
            .unwrap()
            .document
            .is_dirty()
    );
    h.step();
    h.get_by_label("Untitled.md *");
    assert_eq!(
        h.state().workspace.window_title(),
        "Untitled.md * — Markdown Hexer"
    );
}

#[test]
fn undo_survives_a_preview_round_trip() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("abc".to_owned()));
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().content,
        "abc"
    );

    h.key_press_modifiers(Modifiers::COMMAND, Key::E);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().mode,
        Mode::Preview
    );

    h.key_press_modifiers(Modifiers::COMMAND, Key::E);
    h.step();
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();

    assert_eq!(h.state().workspace.active_document().unwrap().content, "");
}

#[test]
fn preview_rebuilds_from_the_current_content_after_editing() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));

    h.get_by_label("Edit").click();
    h.step();
    h.step();
    h.input_mut()
        .events
        .push(egui::Event::Text(" changed".to_owned()));
    h.step();

    let revision = h.state().workspace.active_document().unwrap().revision;
    h.get_by_label("Preview").click();
    h.step();

    assert_eq!(
        h.state().preview_revision,
        Some((h.state().workspace.active_document().unwrap().id, revision))
    );
}

#[test]
fn save_shortcut_writes_an_untitled_document_through_save_as() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::returning(notes_path());
    let mut h = harness(untitled_app(&files, dialogs));

    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "saved text".to_owned(),
    });

    h.key_press_modifiers(Modifiers::COMMAND, Key::S);
    h.step();

    assert_eq!(files.written(notes_path()).as_deref(), Some("saved text"));
    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.path.as_deref(), Some(notes_path().as_path()));
    assert!(!document.is_dirty());
    assert_eq!(document.mode, Mode::Edit);
}

#[test]
fn save_as_updates_path_title_and_image_scope_but_not_mode() {
    let files = MemoryFiles::default();
    let new_path = if cfg!(windows) {
        PathBuf::from(r"D:\other\renamed.md")
    } else {
        PathBuf::from("/other/renamed.md")
    };
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::returning(new_path.clone()),
    ));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Changed".to_owned(),
    });
    h.step();

    h.get_by_label("Save As").click();
    h.step();
    h.step();

    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.path.as_deref(), Some(new_path.as_path()));
    assert_eq!(document.mode, Mode::Preview);
    assert_eq!(document.image_scope(), Some(new_path.parent().unwrap()));
    h.get_by_label("renamed.md");
}

#[test]
fn guard_is_modal_and_cancel_keeps_the_window_open() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });
    h.state_mut().workspace.apply(Command::WindowCloseRequested);
    h.step();
    h.step();

    h.get_by_label("Unsaved changes");
    h.get_by_label("Save");
    h.get_by_label("Don't Save");
    h.get_by_label("Cancel");

    h.get_by_label("Cancel").click();
    h.step();
    assert!(h.state().workspace.guard().is_none());
    assert!(!h.state().allow_close);
    assert!(h.state().workspace.active_document().is_some());
}

#[test]
fn guard_save_failure_keeps_the_window_open_and_the_document_dirty() {
    let files = MemoryFiles::default();
    files.fail_writes.set(true);
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });
    h.state_mut().workspace.apply(Command::WindowCloseRequested);
    h.step();
    h.step();

    h.get_by_label("Save").click();
    h.step();

    assert!(!h.state().allow_close);
    assert!(h.state().workspace.active_document().unwrap().is_dirty());
    assert!(h.state().workspace.guard().is_none());
    h.step();
    h.get_by_label_contains("Could not save notes.md");
}

#[test]
fn guard_dont_save_allows_the_close() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });
    h.state_mut().workspace.apply(Command::WindowCloseRequested);
    h.step();
    h.step();

    h.get_by_label("Don't Save").click();
    h.step();

    assert!(h.state().allow_close);
    assert!(h.state().workspace.guard().is_none());
}

#[test]
fn error_toast_from_a_failed_launch_appears_after_the_first_frame() {
    let files = MemoryFiles::default();
    let missing = if cfg!(windows) {
        PathBuf::from(r"D:\docs\missing.md")
    } else {
        PathBuf::from("/docs/missing.md")
    };
    let startup = startup::launch(Some(missing), &files);
    let mut h = harness(HexerApp::with_platform(
        startup,
        Instant::now(),
        Box::new(files.clone()),
        Box::new(FakeDialogs::default()),
    ));

    h.run_steps(1);
    h.get_by_label_contains("Could not open");
}

#[test]
fn clean_close_does_not_open_the_guard() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.state_mut().workspace.apply(Command::WindowCloseRequested);
    h.step();

    assert!(h.state().workspace.guard().is_none());
}
