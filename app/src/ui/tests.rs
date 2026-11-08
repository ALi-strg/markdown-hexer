use super::*;
use crate::domain::{Command, DocumentId, ExternalChoice, GuardChoice, Mode};
use crate::platform::instance::{InstanceRequest, InstanceServer};
use crate::platform::{Clipboard, ReadError, WriteError};
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
    save_next: Rc<RefCell<Option<PathBuf>>>,
    export_next: Rc<RefCell<Option<PathBuf>>>,
    export_names: Rc<RefCell<Vec<String>>>,
    open_next: Rc<RefCell<Option<PathBuf>>>,
    guard_choices: Rc<RefCell<std::collections::VecDeque<GuardChoice>>>,
    guard_calls: Rc<Cell<usize>>,
    external_choices: Rc<RefCell<std::collections::VecDeque<ExternalChoice>>>,
    external_calls: Rc<Cell<usize>>,
}

impl FakeDialogs {
    fn returning(path: impl Into<PathBuf>) -> Self {
        Self {
            save_next: Rc::new(RefCell::new(Some(path.into()))),
            ..Self::default()
        }
    }

    fn opening(path: impl Into<PathBuf>) -> Self {
        Self {
            open_next: Rc::new(RefCell::new(Some(path.into()))),
            ..Self::default()
        }
    }

    fn exporting(path: impl Into<PathBuf>) -> Self {
        Self {
            export_next: Rc::new(RefCell::new(Some(path.into()))),
            ..Self::default()
        }
    }

    fn guard_choices(choices: impl IntoIterator<Item = GuardChoice>) -> Self {
        Self {
            guard_choices: Rc::new(RefCell::new(choices.into_iter().collect())),
            ..Self::default()
        }
    }

    fn external_choices(choices: impl IntoIterator<Item = ExternalChoice>) -> Self {
        Self {
            external_choices: Rc::new(RefCell::new(choices.into_iter().collect())),
            ..Self::default()
        }
    }
}

impl Dialogs for FakeDialogs {
    fn save_as(&self, _suggested_name: &str) -> Option<PathBuf> {
        self.save_next.borrow_mut().take()
    }

    fn export_html(&self, suggested_name: &str) -> Option<PathBuf> {
        self.export_names
            .borrow_mut()
            .push(suggested_name.to_owned());
        self.export_next.borrow_mut().take()
    }

    fn open(&self) -> Option<PathBuf> {
        self.open_next.borrow_mut().take()
    }

    fn confirm_discard(&self, _title: &str) -> GuardChoice {
        self.guard_calls.set(self.guard_calls.get() + 1);
        self.guard_choices
            .borrow_mut()
            .pop_front()
            .unwrap_or(GuardChoice::Cancel)
    }

    fn external_modified(&self, _title: &str) -> ExternalChoice {
        self.external_calls.set(self.external_calls.get() + 1);
        self.external_choices
            .borrow_mut()
            .pop_front()
            .unwrap_or(ExternalChoice::Cancel)
    }
}

#[derive(Clone, Default)]
struct FakeClipboard {
    text: Rc<RefCell<Option<String>>>,
    fail: Rc<Cell<bool>>,
}

impl FakeClipboard {
    fn copied(&self) -> Option<String> {
        self.text.borrow().clone()
    }
}

impl Clipboard for FakeClipboard {
    fn set_text(&mut self, text: &str) -> Result<(), String> {
        if self.fail.get() {
            return Err("clipboard unavailable".to_owned());
        }
        *self.text.borrow_mut() = Some(text.to_owned());
        Ok(())
    }
}

fn harness(app: HexerApp) -> Harness<'static, HexerApp> {
    Harness::builder()
        .with_size(egui::vec2(900.0, 700.0))
        .build_eframe(|_cc| app)
}

/// Simulate the window manager's close request for one frame.
fn request_close(h: &mut Harness<'static, HexerApp>) {
    let viewport_id = h.input().viewport_id;
    h.input_mut()
        .viewports
        .get_mut(&viewport_id)
        .expect("main viewport")
        .events
        .push(egui::ViewportEvent::Close);
    h.step();
    h.input_mut()
        .viewports
        .get_mut(&viewport_id)
        .expect("main viewport")
        .events
        .clear();
    h.step();
}

/// Simulate the window losing focus and gaining it again.
fn refocus(h: &mut Harness<'static, HexerApp>) {
    h.input_mut().focused = false;
    h.step();
    h.input_mut().focused = true;
    h.step();
}

fn file_app(
    path: impl Into<PathBuf>,
    content: &str,
    files: &MemoryFiles,
    dialogs: FakeDialogs,
) -> HexerApp {
    let path = path.into();
    files.insert(path.clone(), content);
    let startup = startup::launch(vec![path], files);
    HexerApp::with_platform(
        startup,
        Instant::now(),
        Box::new(files.clone()),
        Box::new(dialogs),
    )
}

fn untitled_app(files: &MemoryFiles, dialogs: FakeDialogs) -> HexerApp {
    HexerApp::with_platform(
        startup::launch(Vec::new(), files),
        Instant::now(),
        Box::new(files.clone()),
        Box::new(dialogs),
    )
}

fn file_app_with_clipboard(
    content: &str,
    files: &MemoryFiles,
    clipboard: FakeClipboard,
) -> HexerApp {
    let mut app = file_app(notes_path(), content, files, FakeDialogs::default());
    app.clipboard = Box::new(clipboard);
    app
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

    h.key_press_modifiers(Modifiers::COMMAND, Key::Y);
    h.step();
    assert_eq!(document_content(&h), "pasted text");
}

#[test]
fn redo_covers_typing_and_paste() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("typed".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "");
    h.key_press_modifiers(Modifiers::COMMAND, Key::Y);
    h.step();
    assert_eq!(document_content(&h), "typed");

    h.input_mut()
        .events
        .push(egui::Event::Paste(" pasted".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "typed");
    h.key_press_modifiers(Modifiers::COMMAND, Key::Y);
    h.step();
    assert_eq!(document_content(&h), "typed pasted");
}

#[test]
fn cjk_preedit_previews_and_commit_replaces_it() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Ime(egui::ImeEvent::Preedit {
            text: "にほん".to_owned(),
            active_range_chars: None,
        }));
    h.step();
    assert_eq!(document_content(&h), "にほん");

    let editor_rect = h.get_by_role(Role::MultilineTextInput).rect();
    let first = h
        .output()
        .platform_output
        .ime
        .expect("focused editor must publish an IME cursor rect");
    assert!(first.cursor_rect.is_positive());
    assert!(editor_rect.expand(2.0).contains_rect(first.cursor_rect));

    h.input_mut()
        .events
        .push(egui::Event::Ime(egui::ImeEvent::Preedit {
            text: "にほんご".to_owned(),
            active_range_chars: None,
        }));
    h.step();
    assert_eq!(document_content(&h), "にほんご");
    let wider = h.output().platform_output.ime.unwrap();
    assert!(wider.cursor_rect.right() > first.cursor_rect.right());

    h.input_mut()
        .events
        .push(egui::Event::Ime(egui::ImeEvent::Commit(
            "日本語".to_owned(),
        )));
    h.step();
    assert_eq!(document_content(&h), "日本語");
    let committed = h.output().platform_output.ime.unwrap();
    assert!(committed.cursor_rect.right() > first.cursor_rect.right());
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
    let first = h.state().editor.as_ref().unwrap() as *const EditorResources;
    h.get_by_role(Role::MultilineTextInput);

    h.get_by_label("Preview").click();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );
    assert!(h.query_by_role(Role::MultilineTextInput).is_none());

    h.get_by_label("Edit").click();
    h.step();
    let second = h.state().editor.as_ref().unwrap() as *const EditorResources;
    assert_eq!(
        first, second,
        "editor resources must initialize once per process"
    );
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
fn preview_shows_alt_text_and_drops_unsafe_links() {
    let files = MemoryFiles::default();
    let content = "\
# Images

![missing alt](missing.png)

[js](javascript:alert(1)) [file](file:///etc/passwd) [data](data:text/html,x)
";
    let mut h = harness(file_app(
        notes_path(),
        content,
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.get_by_label("missing alt");
    for label in ["js", "file", "data"] {
        h.get_by_label(label).click();
        h.step();
        assert!(h.state().toast.is_none(), "{label} link escaped filtering");
    }
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
        Some((
            h.state().workspace.active_document().unwrap().id,
            revision,
            h.state()
                .workspace
                .active_document()
                .unwrap()
                .image_scope()
                .map(|path| path.to_path_buf())
        ))
    );
}

#[test]
fn section_chevron_collapses_and_expands_body() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "intro\n\n# Notes\n\nbody text\n\n## Child\n\nchild text\n",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.get_by_label_contains("intro");
    h.get_by_label_contains("body text");
    h.get_by_label_contains("child text");

    h.get_all_by_label("Collapse section")
        .next()
        .unwrap()
        .click();
    h.step();
    h.step();

    h.get_by_label("Expand section");
    assert!(h.query_by_label_contains("body text").is_none());
    assert!(h.query_by_label_contains("child text").is_none());
    assert!(h.query_by_label("Child").is_none());
    h.get_by_label_contains("intro");

    h.get_by_label("Expand section").click();
    h.step();
    h.step();
    h.get_by_label_contains("body text");
    h.get_by_label_contains("child text");
}

#[test]
fn collapse_state_survives_edits_and_mode_switches() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\nbody text\n",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.get_by_label("Collapse section").click();
    h.step();
    h.step();
    assert!(h.query_by_label_contains("body text").is_none());

    h.get_by_label("Edit").click();
    h.step();
    h.step();
    h.input_mut()
        .events
        .push(egui::Event::Text(" changed".to_owned()));
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().content,
        "# Notes\n\nbody text\n changed"
    );
    h.get_by_label("Preview").click();
    h.step();
    h.step();

    h.get_by_label("Expand section");
    assert!(h.query_by_label_contains("body text").is_none());
    assert!(h.query_by_label("Collapse section").is_none());
    h.get_by_label("Expand section").click();
    h.step();
    h.step();
    h.get_by_label_contains("body text");
    h.get_by_label_contains("changed");
}

#[test]
fn collapse_state_drops_when_the_heading_disappears() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\nbody text\n",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.get_by_label("Collapse section").click();
    h.step();
    h.step();
    h.get_by_label("Expand section");

    h.get_by_label("Edit").click();
    h.step();
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();
    h.input_mut()
        .events
        .push(egui::Event::Text("# Renamed\n\nbody text\n".to_owned()));
    h.step();
    h.get_by_label("Preview").click();
    h.step();
    h.step();

    h.get_by_label("Collapse section");
    assert!(h.query_by_label("Expand section").is_none());
    h.get_by_label_contains("body text");
}

#[test]
fn collapse_state_is_per_document_and_survives_tab_switches() {
    let files = MemoryFiles::default();
    let first = PathBuf::from("first.md");
    let second = PathBuf::from("second.md");
    files.insert(first.clone(), "# Same\n\nbody first\n");
    files.insert(second.clone(), "# Same\n\nbody second\n");
    let startup = startup::launch(vec![first, second], &files);
    let app = HexerApp::with_platform(
        startup,
        Instant::now(),
        Box::new(files.clone()),
        Box::new(FakeDialogs::default()),
    );
    let mut h = harness(app);
    h.run_steps(1);

    let ids = workspace_ids(&h);
    h.get_by_label("Collapse section").click();
    h.step();
    h.step();
    assert!(h.query_by_label_contains("body second").is_none());

    h.state_mut().workspace.apply(Command::ActivateTab(ids[0]));
    h.step();
    h.get_by_label("Collapse section");
    h.get_by_label_contains("body first");

    h.state_mut().workspace.apply(Command::ActivateTab(ids[1]));
    h.step();
    h.get_by_label("Expand section");
    assert!(h.query_by_label_contains("body second").is_none());
}

#[test]
fn focused_section_chevron_toggles_with_keyboard() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\nbody text\n",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.get_by_label("Collapse section").focus();
    h.step();
    h.key_press(egui::Key::Enter);
    h.step();
    h.step();
    h.get_by_label("Expand section");
    assert!(h.query_by_label_contains("body text").is_none());

    h.get_by_label("Expand section").focus();
    h.step();
    h.key_press(egui::Key::Space);
    h.step();
    h.step();
    h.get_by_label("Collapse section");
    h.get_by_label_contains("body text");
}

#[test]
fn save_as_changes_the_preview_image_scope() {
    let files = MemoryFiles::default();
    let new_path = if cfg!(windows) {
        PathBuf::from(r"D:\other\notes.md")
    } else {
        PathBuf::from("/other/notes.md")
    };
    let mut h = harness(file_app(
        notes_path(),
        "![alt](image.png)",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    let state = h.state_mut();
    state.workspace.apply(Command::SaveAs);
    state
        .workspace
        .apply(Command::SaveAsChosen(new_path.clone()));
    state.workspace.apply(Command::WriteSucceeded);
    state.sync_editor_resources();

    assert_eq!(
        h.state()
            .preview_revision
            .as_ref()
            .map(|(_, _, scope)| scope),
        Some(&Some(new_path.parent().unwrap().to_path_buf()))
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
fn guard_native_cancel_keeps_the_window_open() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::guard_choices([GuardChoice::Cancel]);
    let calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });

    request_close(&mut h);

    assert_eq!(calls.get(), 1, "exactly one native Guard dialog");
    assert!(h.state().workspace.guard().is_none());
    assert!(!h.state().allow_close);
    assert!(h.state().workspace.active_document().is_some());
}

#[test]
fn guard_save_failure_keeps_the_window_open_and_the_document_dirty() {
    let files = MemoryFiles::default();
    files.fail_writes.set(true);
    let dialogs = FakeDialogs::guard_choices([GuardChoice::Save]);
    let calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });

    request_close(&mut h);

    assert_eq!(calls.get(), 1);
    assert!(!h.state().allow_close);
    assert!(h.state().workspace.active_document().unwrap().is_dirty());
    assert!(h.state().workspace.guard().is_none());
    h.get_by_label_contains("Could not save notes.md");
}

#[test]
fn guard_dont_save_allows_the_close() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::guard_choices([GuardChoice::DontSave]);
    let calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Dirty".to_owned(),
    });

    request_close(&mut h);

    assert_eq!(calls.get(), 1);
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
    let startup = startup::launch(vec![missing], &files);
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

fn other_path() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(r"D:\docs\other.md")
    } else {
        PathBuf::from("/docs/other.md")
    }
}

fn add_file(h: &mut Harness<'static, HexerApp>, path: impl Into<PathBuf>, content: &str) {
    h.state_mut().workspace.apply(Command::FileLoaded {
        path: path.into(),
        content: content.to_owned(),
    });
}

fn workspace_ids(h: &Harness<'static, HexerApp>) -> Vec<DocumentId> {
    h.state()
        .workspace
        .tabs()
        .iter()
        .map(|tab| tab.document.id)
        .collect()
}

#[derive(Debug)]
struct DroppedPath(PathBuf);

impl egui::DroppedFile for DroppedPath {
    fn path(&self) -> &std::path::Path {
        &self.0
    }

    fn bytes(&self) -> Result<Vec<u8>, String> {
        Err("not needed in this test".to_owned())
    }
}

fn drop_paths(h: &mut Harness<'static, HexerApp>, paths: impl IntoIterator<Item = PathBuf>) {
    h.input_mut().dropped_files.extend(
        paths
            .into_iter()
            .map(|path| std::sync::Arc::new(DroppedPath(path)) as egui::DroppedFileHandle),
    );
    h.step();
    h.step();
}

#[test]
fn new_button_inserts_after_active_and_focuses_the_editor() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.get_by_label("New").click();
    h.step();
    h.step();

    assert_eq!(h.state().workspace.tabs().len(), 2);
    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.untitled_number, Some(2));
    assert_eq!(document.mode, Mode::Edit);
    h.get_by_label("Untitled.md");
    h.get_by_label("Untitled 2.md");

    h.input_mut()
        .events
        .push(egui::Event::Text("second tab".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "second tab");
}

#[test]
fn cmd_t_inserts_a_new_tab_after_active() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.key_press_modifiers(Modifiers::COMMAND, Key::T);
    h.step();
    h.step();

    assert_eq!(h.state().workspace.tabs().len(), 2);
    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .unwrap()
            .untitled_number,
        Some(2)
    );
    h.get_by_label("Untitled 2.md");
}

#[test]
fn open_button_replaces_a_sole_empty_untitled() {
    let files = MemoryFiles::default();
    files.insert(notes_path(), "# Notes");
    let mut h = harness(untitled_app(&files, FakeDialogs::opening(notes_path())));
    h.run_steps(1);

    h.get_by_label("Open").click();
    h.step();
    h.step();

    assert_eq!(h.state().workspace.tabs().len(), 1);
    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.path.as_deref(), Some(notes_path().as_path()));
    assert_eq!(document.content, "# Notes");
    assert_eq!(document.mode, Mode::Preview);
    h.get_by_label("notes.md");
}

#[test]
fn cmd_o_opens_a_file_after_the_active_tab() {
    let files = MemoryFiles::default();
    files.insert(other_path(), "# Other");
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::opening(other_path()),
    ));
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::O);
    h.step();
    h.step();

    assert_eq!(h.state().workspace.tabs().len(), 2);
    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.path.as_deref(), Some(other_path().as_path()));
    assert_eq!(document.content, "# Other");
    h.get_by_label("notes.md");
    h.get_by_label("other.md");
}

#[test]
fn tab_bar_shows_every_tab_dirty_marker_and_close_button_in_both_modes() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();
    add_file(&mut h, other_path(), "# Other");
    h.step();

    let notes = workspace_ids(&h)[0];
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id: notes,
        content: "# Dirty".to_owned(),
    });
    h.step();

    h.get_by_label("notes.md *");
    h.get_by_label("other.md");
    assert_eq!(h.get_all_by_label("×").count(), 2);

    h.get_by_label("Edit").click();
    h.step();
    h.get_by_label("notes.md *");
    h.get_by_label("other.md");
}

#[test]
fn same_basenames_get_parent_folders_in_their_tab_labels() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        "left/notes.md",
        "# Left",
        &files,
        FakeDialogs::default(),
    ));
    h.step();
    add_file(&mut h, "right/notes.md", "# Right");
    h.step();

    h.get_by_label("notes.md — left");
    h.get_by_label("notes.md — right");
}

#[test]
fn each_tab_keeps_its_mode_across_switches() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();

    h.get_by_label("New").click();
    h.step();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Edit)
    );

    h.get_by_label("notes.md").click();
    h.step();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );

    h.get_by_label("Untitled.md").click();
    h.step();
    h.step();
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Edit)
    );
}

#[test]
fn cursor_and_undo_survive_switching_away_and_back() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("abc".to_owned()));
    h.step();
    h.key_press(Key::ArrowLeft);
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::N);
    h.step();
    h.step();
    h.input_mut().events.push(egui::Event::Text("x".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "x");

    h.get_by_label("Untitled.md *").click();
    h.step();
    h.step();
    h.input_mut().events.push(egui::Event::Text("Z".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "abZc");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "abc");

    h.key_press_modifiers(Modifiers::CTRL, Key::Tab);
    h.step();
    h.step();
    h.key_press_modifiers(Modifiers::CTRL.plus(Modifiers::SHIFT), Key::Tab);
    h.step();
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::Y);
    h.step();
    assert_eq!(document_content(&h), "abZc");
}

#[test]
fn preview_scroll_ids_are_per_document() {
    assert_eq!(preview_scroll_id(7), preview_scroll_id(7));
    assert_ne!(preview_scroll_id(7), preview_scroll_id(8));
}

#[test]
fn save_shortcut_uses_editor_content_from_the_same_frame() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::returning(notes_path())));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("typed".to_owned()));
    h.input_mut().events.push(egui::Event::Key {
        key: Key::S,
        physical_key: None,
        pressed: true,
        repeat: false,
        modifiers: Modifiers::COMMAND,
    });
    h.step();
    h.step();

    assert_eq!(files.written(notes_path()).as_deref(), Some("typed"));
}

#[test]
fn keyboard_reorder_moves_the_active_tab() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app("a.md", "a", &files, FakeDialogs::default()));
    add_file(&mut h, "b.md", "b");
    add_file(&mut h, "c.md", "c");
    h.step();

    let ids = workspace_ids(&h);
    h.state_mut().workspace.apply(Command::ActivateTab(ids[1]));
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND.plus(Modifiers::SHIFT), Key::PageUp);
    h.step();

    assert_eq!(workspace_ids(&h), vec![ids[1], ids[0], ids[2]]);
    assert_eq!(h.state().workspace.active_document().unwrap().id, ids[1]);
}

#[test]
fn dragging_a_tab_reorders_it() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app("a.md", "a", &files, FakeDialogs::default()));
    add_file(&mut h, "b.md", "b");
    add_file(&mut h, "c.md", "c");
    h.step();

    let ids = workspace_ids(&h);
    let from = h.get_by_label("a.md").rect().center();
    let to = h.get_by_label("c.md").rect().center();
    h.drag_at(from);
    h.step();
    h.hover_at(to);
    h.step();
    h.drop_at(to);
    h.step();

    assert_eq!(workspace_ids(&h), vec![ids[1], ids[2], ids[0]]);
    h.get_by_label("a.md");
}

#[test]
fn quit_guard_shows_each_dirty_tab_in_order() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::guard_choices([GuardChoice::DontSave, GuardChoice::DontSave]);
    let calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    h.step();
    add_file(&mut h, other_path(), "# Other");
    let ids = workspace_ids(&h);
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id: ids[0],
        content: "# Dirty notes".to_owned(),
    });
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id: ids[1],
        content: "# Dirty other".to_owned(),
    });

    request_close(&mut h);

    // Both dirty tabs are guarded in order without a second close request.
    assert_eq!(calls.get(), 2);
    assert!(h.state().allow_close);
    assert!(h.state().workspace.guard().is_none());
}

#[test]
fn clean_external_change_reloads_without_a_dialog() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::default();
    let calls = Rc::clone(&dialogs.external_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    h.step();

    files.insert(notes_path(), "# Changed on disk");
    refocus(&mut h);

    assert_eq!(document_content(&h), "# Changed on disk");
    assert_eq!(calls.get(), 0);
}

#[test]
fn external_reload_uses_the_native_dialog_and_clears_dirty() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::external_choices([ExternalChoice::Reload]);
    let calls = Rc::clone(&dialogs.external_calls);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    h.step();
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Mine".to_owned(),
    });
    files.insert(notes_path(), "# Disk");

    refocus(&mut h);

    assert_eq!(calls.get(), 1);
    assert_eq!(document_content(&h), "# Disk");
    assert!(!h.state().workspace.active_document().unwrap().is_dirty());
    assert_eq!(
        h.state().workspace.window_title(),
        "notes.md — Markdown Hexer"
    );
}

#[test]
fn external_overwrite_writes_the_in_memory_content() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::external_choices([ExternalChoice::Overwrite]);
    let mut h = harness(file_app(notes_path(), "# Notes", &files, dialogs));
    h.step();
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "# Mine".to_owned(),
    });
    files.insert(notes_path(), "# Disk");

    refocus(&mut h);

    assert_eq!(files.written(notes_path()).as_deref(), Some("# Mine"));
    assert!(!h.state().workspace.active_document().unwrap().is_dirty());
}

#[test]
fn tab_close_button_closes_the_last_tab_and_the_window() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();

    h.get_by_label("×").click();
    h.step();

    assert!(h.state().allow_close);
}

#[test]
fn dropped_files_open_in_order_and_last_is_active() {
    let files = MemoryFiles::default();
    files.insert(notes_path(), "# Notes");
    files.insert(other_path(), "# Other");
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.step();

    drop_paths(&mut h, [notes_path(), other_path()]);

    assert_eq!(
        h.state().workspace.tabs().len(),
        2,
        "the Untitled placeholder is replaced by the first drop"
    );
    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .unwrap()
            .path
            .as_deref(),
        Some(other_path().as_path())
    );
}

#[test]
fn code_theme_uses_palette_syntax_colors() {
    let theme = crate::export::code_theme(&egui::Style::default(), &Palette::LIGHT);
    use egui_extras::syntax_highlighting::TokenType;

    assert_eq!(
        theme.format(TokenType::Keyword).color,
        Palette::LIGHT.syntax_keyword
    );
    assert_eq!(
        theme.format(TokenType::StringLiteral).color,
        Palette::LIGHT.syntax_string
    );
    assert_eq!(
        theme.format(TokenType::Comment).color,
        Palette::LIGHT.syntax_comment
    );
    assert_eq!(
        theme.format(TokenType::Literal).color,
        Palette::LIGHT.syntax_number
    );
    assert_eq!(
        theme.format(TokenType::Function).color,
        Palette::LIGHT.syntax_function
    );
    assert_eq!(
        theme.format(TokenType::Punctuation).color,
        Palette::LIGHT.syntax_punctuation
    );
}

#[test]
fn dropping_an_open_file_focuses_its_tab() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();
    add_file(&mut h, other_path(), "# Other");
    assert_eq!(workspace_ids(&h).len(), 2);

    drop_paths(&mut h, [notes_path()]);

    assert_eq!(workspace_ids(&h).len(), 2);
    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .unwrap()
            .path
            .as_deref(),
        Some(notes_path().as_path())
    );
}

#[test]
fn about_opens_from_the_toolbar_and_shortcut_in_either_mode() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::Slash);
    h.step();
    assert!(h.state().about_open);
    h.get_by_label("Markdown Hexer");
    h.get_by_label("Version 2.0.0");
    h.get_by_label(REPOSITORY);
    h.get_by_label("Shortcuts");
    h.key_press(Key::Escape);
    h.step();
    assert!(!h.state().about_open);

    h.get_by_label("Edit").click();
    h.step();
    h.get_by_label("About").click();
    h.step();
    assert!(h.state().about_open);
    h.key_press(Key::Escape);
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::Slash);
    h.step();
    assert!(h.state().about_open);
}

#[test]
fn instance_paths_open_and_focus_the_window() {
    let files = MemoryFiles::default();
    files.insert(notes_path(), "# Notes");
    files.insert(other_path(), "# Other");
    let (tx, rx) = std::sync::mpsc::channel();
    let mut app = untitled_app(&files, FakeDialogs::default());
    app.attach_instance(InstanceServer::from_receiver(rx));
    let mut h = harness(app);
    h.step();

    tx.send(InstanceRequest {
        paths: vec![notes_path(), other_path()],
        focus: true,
    })
    .unwrap();
    h.step();
    h.step();

    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .unwrap()
            .path
            .as_deref(),
        Some(other_path().as_path())
    );
    assert!(!h.state().focus_window);

    tx.send(InstanceRequest {
        paths: vec![notes_path()],
        focus: true,
    })
    .unwrap();
    h.step();
    h.step();

    assert_eq!(
        h.state()
            .workspace
            .active_document()
            .unwrap()
            .path
            .as_deref(),
        Some(notes_path().as_path())
    );
    assert!(!h.state().focus_window);
}

#[test]
fn highlighted_code_does_not_wrap() {
    let ctx = egui::Context::default();
    let style = egui::Style::default();
    let code = FencedCode {
        language: Some("rust".to_owned()),
        text: "fn main() {\n    let name = \"hexer\"; // note\n}\n".to_owned(),
    };
    let job = code_layout_job(&ctx, &style, &Palette::LIGHT, &code);

    assert!(job.wrap.max_width.is_infinite());
    let colors: Vec<egui::Color32> = job
        .sections
        .iter()
        .map(|section| section.format.color)
        .collect();
    assert!(colors.contains(&Palette::LIGHT.syntax_keyword));
    assert!(colors.contains(&Palette::LIGHT.syntax_string));
    assert!(colors.contains(&Palette::LIGHT.syntax_comment));
}

#[test]
fn code_blocks_scroll_inside_the_page_instead_of_widening_it() {
    let widths = Rc::new(Cell::new((0.0, 0.0)));
    let widths_for_ui = widths.clone();
    let code = FencedCode {
        language: Some("rust".to_owned()),
        text: "let value = 1234567890; ".repeat(40),
    };
    let mut h = Harness::builder()
        .with_size(egui::vec2(320.0, 240.0))
        .build_ui(move |ui| {
            ui.set_max_width(300.0);
            let (frame, content) =
                show_code_block(ui, &Palette::LIGHT, &code, 0, &RefCell::new(None));
            widths_for_ui.set((frame.rect.width(), content.rect.width()));
        });
    h.run_steps(1);

    let (outer_width, content_width) = widths.get();
    assert!(outer_width <= 301.0, "code frame width was {outer_width}");
    assert!(
        content_width > 600.0,
        "code content width was {content_width}"
    );
}

#[test]
fn code_copy_button_writes_clipboard_and_shows_the_copy_toast() {
    let files = MemoryFiles::default();
    let clipboard = FakeClipboard::default();
    let source = "# Code\n\n```rust\nfn main() {}\n```\n";
    let app = file_app_with_clipboard(source, &files, clipboard.clone());
    let mut h = harness(app);
    h.run_steps(2);

    h.get_by_label("Copy").click();
    h.run_steps(1);

    assert_eq!(clipboard.copied().as_deref(), Some("fn main() {}"));
    assert_eq!(
        h.state().toast.as_ref().map(|toast| toast.message.as_str()),
        Some("Copied")
    );
    assert_eq!(document_content(&h), source);
}

#[test]
fn code_copy_button_is_keyboard_reachable() {
    let files = MemoryFiles::default();
    let clipboard = FakeClipboard::default();
    let app = file_app_with_clipboard("```\nkeyboard copy\n```\n", &files, clipboard.clone());
    let mut h = harness(app);
    h.run_steps(2);

    h.get_by_label("Copy").focus();
    h.run_steps(1);
    assert!(h.get_by_label("Copy").is_focused());
    h.key_press(Key::Enter);
    h.run_steps(1);

    assert_eq!(clipboard.copied().as_deref(), Some("keyboard copy"));
    assert_eq!(
        h.state().toast.as_ref().map(|toast| toast.message.as_str()),
        Some("Copied")
    );
}

#[test]
fn clipboard_failure_shows_a_toast_and_keeps_the_document() {
    let files = MemoryFiles::default();
    let clipboard = FakeClipboard::default();
    clipboard.fail.set(true);
    let source = "```\ncannot copy\n```\n";
    let app = file_app_with_clipboard(source, &files, clipboard.clone());
    let mut h = harness(app);
    h.run_steps(2);

    h.get_by_label("Copy").click();
    h.run_steps(1);

    assert!(clipboard.copied().is_none());
    assert_eq!(
        h.state().toast.as_ref().map(|toast| toast.message.as_str()),
        Some("Could not copy")
    );
    assert_eq!(document_content(&h), source);
}

#[test]
fn edit_mode_selection_is_not_auto_copied() {
    let files = MemoryFiles::default();
    let clipboard = FakeClipboard::default();
    let source = "# Notes\n\nBody.";
    let app = file_app_with_clipboard(source, &files, clipboard.clone());
    let mut h = harness(app);
    h.run_steps(1);

    h.get_by_label("Edit").click();
    h.run_steps(2);
    assert_eq!(
        h.state().workspace.active_document().map(|doc| doc.mode),
        Some(Mode::Edit)
    );

    let ctx = h.ctx.clone();
    h.state_mut().handle_selection_settled(&ctx, "Body.");

    assert!(clipboard.copied().is_none());
    assert!(h.state().toast.is_none());
    assert_eq!(document_content(&h), source);
}

#[test]
fn preview_drag_selection_is_copied_on_release() {
    let files = MemoryFiles::default();
    let clipboard = FakeClipboard::default();
    let app = file_app_with_clipboard("Copy this sentence.", &files, clipboard.clone());
    let mut h = harness(app);
    h.run_steps(2);

    let rect = h.get_by_label_contains("Copy this sentence").rect();
    let start = rect.left_center() + egui::vec2(2.0, 0.0);
    let end = rect.right_center();
    h.drag_at(start);
    h.run_steps(1);
    h.hover_at(end);
    h.run_steps(1);
    h.drop_at(end);
    h.run_steps(2);

    assert_eq!(clipboard.copied().as_deref(), Some("Copy this sentence."));
    assert_eq!(
        h.state().toast.as_ref().map(|toast| toast.message.as_str()),
        Some("Copied")
    );
    assert!(
        !h.ctx
            .plugin::<egui::text_selection::LabelSelectionState>()
            .lock()
            .has_selection()
    );
}

#[test]
fn readme_fixture_renders_tables_and_code_in_preview() {
    let files = MemoryFiles::default();
    let app = file_app(
        notes_path(),
        include_str!("../../tests/fixtures/readme.md"),
        &files,
        FakeDialogs::default(),
    );
    let mut h = Harness::builder()
        .with_size(egui::vec2(900.0, 700.0))
        .allow_missing_glyphs()
        .build_eframe(|_cc| app);
    h.run_steps(1);
    h.get_by_label("Preview").click();
    h.run_steps(2);

    h.get_by_label("Tech Stack");
    h.get_by_label_contains("npm install");
}

#[test]
fn malformed_markdown_renders_without_panicking() {
    let files = MemoryFiles::default();
    let app = file_app(
        notes_path(),
        "Still here.\n\n| a | b |\n|---|---|\n| 1 |\n\n[^1]: no ref\n\n~~open\n\n```\n<not html>\n\n<div>raw</div>\n",
        &files,
        FakeDialogs::default(),
    );
    let mut h = Harness::builder()
        .with_size(egui::vec2(900.0, 700.0))
        .allow_missing_glyphs()
        .build_eframe(|_cc| app);
    h.run_steps(1);
    h.get_by_label("Preview").click();
    h.run_steps(2);

    h.get_by_label_contains("Still here.");
}

#[test]
fn formatting_buttons_are_visible_only_in_edit() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    for label in ["Bold", "Italic", "Heading", "List", "Link", "Code"] {
        h.get_by_label(label);
    }

    h.get_by_label("Preview").click();
    h.run_steps(2);
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );
    for label in ["Bold", "Italic", "Heading", "List", "Link", "Code"] {
        assert!(h.query_by_label(label).is_none(), "{label} in Preview");
    }
}

#[test]
fn cmd_b_and_cmd_i_format_the_selection_once() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::B);
    h.step();
    assert_eq!(document_content(&h), "**hello**");

    h.key_press_modifiers(Modifiers::COMMAND, Key::I);
    h.step();
    assert_eq!(document_content(&h), "_**hello**_");
}

#[test]
fn cmd_b_and_cmd_i_do_nothing_in_preview() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "hello",
        &files,
        FakeDialogs::default(),
    ));
    h.run_steps(1);

    h.key_press_modifiers(Modifiers::COMMAND, Key::B);
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::I);
    h.step();

    assert_eq!(document_content(&h), "hello");
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Preview)
    );
}

#[test]
fn toolbar_bold_is_one_undo_step() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();

    h.get_by_label("Bold").click();
    h.step();
    assert_eq!(document_content(&h), "**hello**");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "hello");
}

#[test]
fn formatting_preserves_the_selection_for_typing() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();

    h.get_by_label("Heading").click();
    h.step();
    assert_eq!(document_content(&h), "## hello");

    h.input_mut().events.push(egui::Event::Text("X".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "## X");
}

#[test]
fn link_keeps_the_label_and_selects_the_url() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();

    h.get_by_label("Link").click();
    h.step();
    assert_eq!(document_content(&h), "[hello](url)");

    h.input_mut()
        .events
        .push(egui::Event::Text("https://example.com".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "[hello](https://example.com)");
}

#[test]
fn empty_selection_inserts_bold_markers_with_the_caret_between() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.get_by_label("Bold").click();
    h.step();
    assert_eq!(document_content(&h), "****");

    h.input_mut().events.push(egui::Event::Text("x".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "**x**");
}

#[test]
fn formatting_then_typing_undoes_one_change_at_a_time() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("hello".to_owned()));
    h.step();
    h.key_press_modifiers(Modifiers::COMMAND, Key::A);
    h.step();
    h.get_by_label("Bold").click();
    h.step();
    h.input_mut().events.push(egui::Event::Text("X".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "X");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "**hello**");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "hello");
}

#[test]
fn cmd_f_from_preview_switches_to_edit_and_focuses_the_find_field() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\nalpha ALPHA",
        &files,
        FakeDialogs::default(),
    ));
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::F);
    h.step();
    assert!(h.state().find_open);
    assert_eq!(
        h.state().workspace.active_document().map(|d| d.mode),
        Some(Mode::Edit)
    );

    // The search field is focused on the next frame.
    h.step();
    h.get_by_label("Find");
    h.get_by_label("Replace All");
    h.input_mut()
        .events
        .push(egui::Event::Text("alpha".to_owned()));
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.query,
        "alpha"
    );
    assert_eq!(document_content(&h), "# Notes\n\nalpha ALPHA");
    h.get_by_label("1 of 2");

    h.key_press(Key::Escape);
    h.step();
    assert!(!h.state().find_open);

    h.input_mut().events.push(egui::Event::Text("X".to_owned()));
    h.step();
    assert!(document_content(&h).contains('X'));
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.query,
        "alpha"
    );
}

#[test]
fn cmd_f_opens_find_in_edit_and_no_match_is_shown() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);

    h.key_press_modifiers(Modifiers::COMMAND, Key::F);
    h.step();
    assert!(h.state().find_open);
    h.get_by_label("Find");
    h.get_by_label("Replace All");

    h.input_mut()
        .events
        .push(egui::Event::Text("missing".to_owned()));
    h.step();
    h.get_by_label("No matches");
    assert_eq!(document_content(&h), "");
}

#[test]
fn find_query_and_current_match_are_per_tab() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "alpha alpha",
        &files,
        FakeDialogs::default(),
    ));
    add_file(&mut h, other_path(), "beta beta");
    h.step();
    let ids = workspace_ids(&h);

    h.state_mut().workspace.apply(Command::ActivateTab(ids[0]));
    h.state_mut().workspace.apply(Command::SetMode(Mode::Edit));
    h.key_press_modifiers(Modifiers::COMMAND, Key::F);
    h.step();
    h.step();
    h.input_mut()
        .events
        .push(egui::Event::Text("alpha".to_owned()));
    h.step();
    h.key_press(Key::Enter);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.current,
        1
    );

    h.state_mut().workspace.apply(Command::ActivateTab(ids[1]));
    h.state_mut().workspace.apply(Command::SetMode(Mode::Edit));
    h.state_mut().workspace.apply(Command::Find {
        query: "beta".to_owned(),
    });
    h.step();
    h.get_by_label("1 of 2");

    h.state_mut().workspace.apply(Command::ActivateTab(ids[0]));
    h.step();
    let document = h.state().workspace.active_document().unwrap();
    assert_eq!(document.find.query, "alpha");
    assert_eq!(document.find.current, 1);
    h.get_by_label("2 of 2");
}

#[test]
fn enter_and_shift_enter_move_find_matches() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);
    h.input_mut()
        .events
        .push(egui::Event::Text("x x x".to_owned()));
    h.step();
    assert_eq!(document_content(&h), "x x x");

    h.key_press_modifiers(Modifiers::COMMAND, Key::F);
    h.step();
    h.input_mut().events.push(egui::Event::Text("x".to_owned()));
    h.step();
    h.key_press(Key::Enter);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.current,
        1
    );
    h.key_press(Key::Enter);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.current,
        2
    );
    h.key_press_modifiers(Modifiers::SHIFT, Key::Enter);
    h.step();
    assert_eq!(
        h.state().workspace.active_document().unwrap().find.current,
        1
    );
}

#[test]
fn replace_all_is_a_single_undo_step() {
    let files = MemoryFiles::default();
    let mut h = harness(untitled_app(&files, FakeDialogs::default()));
    h.run_steps(1);
    h.input_mut()
        .events
        .push(egui::Event::Text("foo foo foo".to_owned()));
    h.step();

    h.key_press_modifiers(Modifiers::COMMAND, Key::F);
    h.step();
    h.input_mut()
        .events
        .push(egui::Event::Text("foo".to_owned()));
    h.step();
    h.state_mut().replace_text = "bar".to_owned();
    h.get_by_label("Replace All").click();
    h.step();
    h.step();
    assert_eq!(document_content(&h), "bar bar bar");

    h.key_press_modifiers(Modifiers::COMMAND, Key::Z);
    h.step();
    assert_eq!(document_content(&h), "foo foo foo");
}

#[test]
fn first_frame_uses_the_injected_palette_without_a_white_flash() {
    let files = MemoryFiles::default();
    let settings = Settings {
        theme: Theme::Dark,
        ..Settings::default()
    };
    let app = untitled_app(&files, FakeDialogs::default()).with_settings(settings, None);
    let h = harness(app);

    assert_eq!(h.state().palette, Palette::DARK);
    let visuals = h.ctx.global_style().visuals.clone();
    assert_eq!(visuals.panel_fill, Palette::DARK.bg);
    assert_eq!(visuals.window_fill, Palette::DARK.surface);
    assert_eq!(visuals.code_bg_color, Palette::DARK.code_bg);
    assert_eq!(visuals.hyperlink_color, Palette::DARK.link);
    assert_eq!(visuals.selection.bg_fill, Palette::DARK.selection);
    assert_eq!(visuals.widgets.active.bg_stroke.color, Palette::DARK.focus);
    assert_eq!(
        eframe::App::clear_color(h.state(), &visuals),
        Palette::DARK.bg.to_normalized_gamma_f32()
    );
}

#[test]
fn system_theme_follows_the_os_live() {
    let files = MemoryFiles::default();
    let settings = Settings {
        theme: Theme::System,
        ..Settings::default()
    };
    let app = untitled_app(&files, FakeDialogs::default()).with_settings(settings, None);
    let mut h = harness(app);
    h.input_mut().system_theme = Some(egui::Theme::Dark);
    h.run_steps(1);
    assert_eq!(h.state().palette, Palette::DARK);

    h.input_mut().system_theme = Some(egui::Theme::Light);
    h.run_steps(1);
    assert_eq!(h.state().palette, Palette::LIGHT);
}

#[test]
fn appearance_menu_switches_theme_immediately_and_persists() {
    let files = MemoryFiles::default();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let app = untitled_app(&files, FakeDialogs::default())
        .with_settings(Settings::default(), Some(path.clone()));
    let mut h = harness(app);

    h.get_by_label("Appearance").click();
    h.run();
    h.get_by_label("Theme").click();
    h.run();
    h.get_by_label("Dark").click();
    h.run();

    assert_eq!(h.state().settings.theme, Theme::Dark);
    assert_eq!(h.state().palette, Palette::DARK);
    assert_eq!(Settings::load(&path).theme, Theme::Dark);
}

#[test]
fn choice_helpers_apply_and_persist_font_and_text_size() {
    let files = MemoryFiles::default();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let mut app = untitled_app(&files, FakeDialogs::default())
        .with_settings(Settings::default(), Some(path.clone()));
    let ctx = egui::Context::default();

    app.choose_font(&ctx, FontChoice::Serif);
    app.choose_text_size(&ctx, TextSize::Large);

    let editor = app.editor.as_ref().expect("edit mode has editor resources");
    assert_eq!(editor.font.size, 16.0);
    assert_eq!(
        editor.font.family,
        egui::FontFamily::Name(crate::settings::CONTENT_SERIF.into())
    );
    let saved = Settings::load(&path);
    assert_eq!(saved.font, FontChoice::Serif);
    assert_eq!(saved.text_size, TextSize::Large);
}

#[test]
fn preview_content_style_applies_font_and_size_but_not_chrome() {
    let ctx = egui::Context::default();
    let base_heading = ctx.global_style().text_styles[&egui::TextStyle::Heading].size;
    let base_body = ctx.global_style().text_styles[&egui::TextStyle::Body].size;
    let mut captured = None;
    let mut chrome = None;
    let output = ctx.run_ui(Default::default(), |ui| {
        apply_preview_text_style(ui, FontChoice::Serif, TextSize::Large);
        let styles = &ui.style().text_styles;
        captured = Some((
            styles[&egui::TextStyle::Body].clone(),
            styles[&egui::TextStyle::Heading].size,
            styles[&egui::TextStyle::Monospace].size,
        ));
        chrome = Some(styles[&egui::TextStyle::Small].clone());
    });
    output.drop_without_applying_deltas();

    let (body, heading, monospace) = captured.expect("content style captured");
    assert_eq!(body.size, TextSize::Large.preview_size());
    assert_eq!(
        body.family,
        egui::FontFamily::Name(crate::settings::CONTENT_SERIF.into())
    );
    assert_eq!(heading, base_heading * 17.0 / 15.0);
    assert_eq!(monospace, TextSize::Large.preview_size());
    assert_eq!(chrome.expect("small style captured").size, 9.0);
    assert_eq!(
        ctx.global_style().text_styles[&egui::TextStyle::Body].size,
        base_body
    );
}

#[test]
fn every_theme_drives_the_chrome_tokens_it_resolves_to() {
    for theme in Theme::ALL {
        let files = MemoryFiles::default();
        let settings = Settings {
            theme,
            ..Settings::default()
        };
        let app = untitled_app(&files, FakeDialogs::default()).with_settings(settings, None);
        let h = harness(app);
        let palette = h.state().palette;
        let visuals = &h.ctx.global_style().visuals;
        assert_eq!(visuals.panel_fill, palette.bg, "{theme:?}");
        assert_eq!(visuals.window_fill, palette.surface, "{theme:?}");
        assert_eq!(visuals.code_bg_color, palette.code_bg, "{theme:?}");
        assert_eq!(visuals.hyperlink_color, palette.link, "{theme:?}");
        assert_eq!(visuals.selection.bg_fill, palette.selection, "{theme:?}");
        assert_eq!(visuals.selection.stroke.color, palette.focus, "{theme:?}");
    }
}

fn export_path() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from(r"D:\docs\notes.html")
    } else {
        PathBuf::from("/docs/notes.html")
    }
}

fn css_hex(color: egui::Color32) -> String {
    format!("#{:02x}{:02x}{:02x}", color.r(), color.g(), color.b())
}

#[test]
fn export_in_preview_writes_standalone_html_without_touching_the_document() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::exporting(export_path());
    let names = Rc::clone(&dialogs.export_names);
    let guard_calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(
        notes_path(),
        "# Notes\n\n**bold** [x](javascript:alert(1))",
        &files,
        dialogs,
    ));
    h.step();

    h.get_by_label("Export HTML").click();
    h.step();
    h.step();

    assert_eq!(names.borrow().as_slice(), ["notes.html"]);
    let html = files.written(export_path()).expect("exported file");
    assert!(html.starts_with("<!DOCTYPE html>"));
    assert!(html.contains("<h1>Notes</h1>"));
    assert!(html.contains("<strong>bold</strong>"));
    assert!(!html.contains("javascript:"));
    assert!(!html.contains("<script"));
    let toast = h.state().toast.as_ref().expect("export toast");
    assert_eq!(toast.message, "Exported notes.html");
    assert!(!h.state().workspace.export_dialog_open());
    let document = h.state().workspace.active_document().unwrap();
    assert!(!document.is_dirty());
    assert_eq!(document.mode, Mode::Preview);
    assert_eq!(document.path.as_deref(), Some(notes_path().as_path()));
    assert!(h.state().workspace.guard().is_none());
    assert_eq!(guard_calls.get(), 0);
}

#[test]
fn export_in_edit_mode_uses_unsaved_content_and_keeps_it_dirty() {
    let files = MemoryFiles::default();
    let dialogs = FakeDialogs::exporting(export_path());
    let names = Rc::clone(&dialogs.export_names);
    let guard_calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(untitled_app(&files, dialogs));
    h.run_steps(1);

    h.input_mut()
        .events
        .push(egui::Event::Text("unsaved new".to_owned()));
    h.step();

    h.get_by_label("Export HTML").click();
    h.step();
    h.step();

    assert_eq!(names.borrow().as_slice(), ["Untitled.html"]);
    let html = files.written(export_path()).expect("exported file");
    assert!(html.contains("unsaved new"));
    let document = h.state().workspace.active_document().unwrap();
    assert!(document.is_dirty(), "export must not save the document");
    assert_eq!(document.mode, Mode::Edit, "export must not change the Mode");
    assert!(document.path.is_none(), "export must not attach a path");
    assert!(h.state().workspace.guard().is_none());
    assert_eq!(guard_calls.get(), 0);
}

#[test]
fn cancelled_export_writes_nothing_and_shows_no_toast() {
    let files = MemoryFiles::default();
    let mut h = harness(file_app(
        notes_path(),
        "# Notes",
        &files,
        FakeDialogs::default(),
    ));
    h.step();

    h.get_by_label("Export HTML").click();
    h.step();
    h.step();

    assert!(files.written(export_path()).is_none());
    assert!(h.state().toast.is_none());
    assert!(!h.state().workspace.export_dialog_open());
    assert!(!h.state().workspace.active_document().unwrap().is_dirty());
    assert!(h.state().workspace.guard().is_none());
}

#[test]
fn failed_export_shows_a_toast_and_keeps_the_document() {
    let files = MemoryFiles::default();
    files.fail_writes.set(true);
    let dialogs = FakeDialogs::exporting(export_path());
    let guard_calls = Rc::clone(&dialogs.guard_calls);
    let mut h = harness(file_app(notes_path(), "saved", &files, dialogs));
    let document_id = h.state().workspace.active_document().unwrap().id;
    h.state_mut().workspace.apply(Command::ContentChanged {
        document_id,
        content: "unsaved".to_owned(),
    });
    h.step();

    h.get_by_label("Export HTML").click();
    h.step();
    h.step();

    assert!(files.written(export_path()).is_none());
    let toast = h.state().toast.as_ref().expect("failure toast");
    assert_eq!(toast.message, "Could not export notes.html: disk full");
    let document = h.state().workspace.active_document().unwrap();
    assert!(document.is_dirty());
    assert_eq!(document.mode, Mode::Preview);
    assert!(h.state().workspace.guard().is_none());
    assert_eq!(guard_calls.get(), 0);
}

#[test]
fn exported_css_reflects_the_current_theme_font_and_text_size() {
    let files = MemoryFiles::default();
    let settings = Settings {
        theme: Theme::Dark,
        font: FontChoice::Serif,
        text_size: TextSize::Large,
        ..Settings::default()
    };
    let app = file_app(
        notes_path(),
        "text",
        &files,
        FakeDialogs::exporting(export_path()),
    )
    .with_settings(settings, None);
    let mut h = harness(app);
    h.step();

    h.get_by_label("Export HTML").click();
    h.step();
    h.step();

    let html = files.written(export_path()).expect("exported file");
    assert!(html.contains(&format!("--bg: {}", css_hex(Palette::DARK.bg))));
    assert!(html.contains("font-family: Georgia"));
    assert!(html.contains("font-size: 17px"));
}
