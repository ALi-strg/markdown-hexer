mod find;
mod palette;

pub use palette::Palette;

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use egui::text::{CCursor, CCursorRange, LayoutJob};
use egui::widgets::text_edit::TextEditState;
use egui::{
    Align2, CentralPanel, Frame, Id, Key, Label, Margin, Modal, Modifiers, Panel, RichText,
    ScrollArea, Sense, Stroke, TextBuffer, TextEdit, TextWrapMode, Ui, ViewportCommand,
};
use egui_commonmark::CommonMarkViewer;
use egui_extras::syntax_highlighting::{CodeTheme, TokenType, highlight};

use crate::dialogs::{Dialogs, NativeDialogs};
use crate::domain::{Command, DocumentId, Mode, Workspace};
use crate::editor::{EditorResources, EditorSession};
use crate::first_edit::FirstEditProbe;
use crate::format::FormatAction;
use crate::image::{ImageSource, NativeImageSource};
use crate::platform::instance::InstanceServer;
use crate::platform::{FileSystem, NativeFileSystem};
use crate::preview::{self, FencedCode, PreparedPreview};
use crate::startup::{Startup, StartupTimer};
use std::ops::Range;

const REPOSITORY: &str = "https://github.com/ALi-strg/markdown-hexer";

pub struct HexerApp {
    workspace: Workspace,
    preview: Option<PreparedPreview>,
    preview_revision: Option<PreviewKey>,
    images: Box<dyn ImageSource>,
    cache: egui_commonmark::CommonMarkCache,
    palette: Palette,
    editor: Option<EditorResources>,
    editor_sessions: HashMap<DocumentId, EditorSession>,
    focus_editor: bool,
    pending_selection: Option<(DocumentId, Range<usize>)>,
    find_open: bool,
    focus_find: bool,
    replace_text: String,
    toast: Option<Toast>,
    pending_toast: Option<String>,
    style_applied: bool,
    title_sent: Option<String>,
    frame_count: u64,
    timer: StartupTimer,
    files: Box<dyn FileSystem>,
    dialogs: Box<dyn Dialogs>,
    allow_close: bool,
    first_edit: Option<FirstEditProbe>,
    instance: Option<InstanceServer>,
    instance_wake: bool,
    about_open: bool,
    focus_window: bool,
    last_active: Option<DocumentId>,
    was_focused: bool,
    was_guard_open: bool,
}

struct Toast {
    message: String,
    expires_at: Instant,
}

type PreviewKey = (DocumentId, u64, Option<PathBuf>);

/// The bundled fonts have no CJK glyphs, so composition previews would draw
/// tofu (or panic in tests). Load one system CJK face as a fallback.
fn install_cjk_font(ctx: &egui::Context) {
    let candidates: &[&str] = if cfg!(windows) {
        &[
            r"C:\Windows\Fonts\YuGothR.ttc",
            r"C:\Windows\Fonts\msyh.ttc",
            r"C:\Windows\Fonts\msgothic.ttc",
            r"C:\Windows\Fonts\simsun.ttc",
        ]
    } else if cfg!(target_os = "macos") {
        &[
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
        ]
    } else {
        &[
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        ]
    };
    let Some(bytes) = candidates.iter().find_map(|path| std::fs::read(path).ok()) else {
        return;
    };
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "cjk-fallback".to_owned(),
        std::sync::Arc::new(egui::FontData::from_owned(bytes)),
    );
    for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts
            .families
            .entry(family)
            .or_default()
            .push("cjk-fallback".to_owned());
    }
    ctx.set_fonts(fonts);
}

fn preview_scroll_id(document_id: DocumentId) -> Id {
    Id::unique(("preview_scroll", document_id))
}

fn editor_id(document_id: DocumentId) -> Id {
    Id::unique(("markdown_editor", document_id))
}

impl HexerApp {
    pub fn new(startup: Startup, t_main: Instant) -> Self {
        Self::with_platform(
            startup,
            t_main,
            Box::new(NativeFileSystem),
            Box::new(NativeDialogs),
        )
    }

    pub fn with_platform(
        startup: Startup,
        t_main: Instant,
        files: Box<dyn FileSystem>,
        dialogs: Box<dyn Dialogs>,
    ) -> Self {
        Self::with_platform_and_images(startup, t_main, files, dialogs, Box::new(NativeImageSource))
    }

    pub fn with_platform_and_images(
        startup: Startup,
        t_main: Instant,
        files: Box<dyn FileSystem>,
        dialogs: Box<dyn Dialogs>,
        images: Box<dyn ImageSource>,
    ) -> Self {
        let workspace = startup.workspace;
        let active = workspace.active_document();
        let preview = active
            .filter(|document| document.mode == Mode::Preview)
            .map(|document| {
                preview::prepare_with_images(
                    &document.content,
                    document.image_scope(),
                    images.as_ref(),
                )
            });
        let preview_revision = active
            .filter(|document| document.mode == Mode::Preview && preview.is_some())
            .map(|document| {
                (
                    document.id,
                    document.revision,
                    document.image_scope().map(Path::to_path_buf),
                )
            });
        let focus_editor = active.is_some_and(|document| document.mode == Mode::Edit);

        let mut app = Self {
            workspace,
            preview,
            preview_revision,
            images,
            cache: egui_commonmark::CommonMarkCache::default(),
            palette: Palette::default_light(),
            editor: None,
            editor_sessions: HashMap::new(),
            focus_editor,
            pending_selection: None,
            find_open: false,
            focus_find: false,
            replace_text: String::new(),
            toast: None,
            pending_toast: startup.notice,
            style_applied: false,
            title_sent: None,
            frame_count: 0,
            timer: StartupTimer::new(t_main),
            files,
            dialogs,
            allow_close: false,
            first_edit: FirstEditProbe::from_env(),
            instance: None,
            instance_wake: false,
            about_open: false,
            focus_window: false,
            last_active: None,
            was_focused: false,
            was_guard_open: false,
        };
        app.sync_editor_resources();
        app
    }

    /// Hand the running instance's launch receiver to the UI. Main attaches
    /// this after the primary process has bound the socket.
    pub fn attach_instance(&mut self, server: InstanceServer) {
        self.instance = Some(server);
    }

    fn drain_instance(&mut self, ctx: &egui::Context) {
        if !self.instance_wake {
            self.instance_wake = true;
            if let Some(server) = &self.instance {
                let ctx = ctx.clone();
                server.set_wake(move || ctx.request_repaint());
            }
        }

        let requests: Vec<_> = self
            .instance
            .as_ref()
            .map(|server| std::iter::from_fn(|| server.try_recv()).collect())
            .unwrap_or_default();
        if requests.is_empty() {
            return;
        }

        self.focus_window |= requests.iter().any(|request| request.focus);
        let commands = requests
            .into_iter()
            .flat_map(|request| request.paths)
            .map(|path| Command::OpenPath(self.files.canonicalize(&path)))
            .collect();
        self.dispatch(ctx, commands);

        if std::mem::take(&mut self.focus_window) {
            ctx.send_viewport_cmd(ViewportCommand::Minimized(false));
            ctx.send_viewport_cmd(ViewportCommand::Focus);
        }
    }

    fn handle_dropped_files(&mut self, ctx: &egui::Context) {
        let dropped = ctx.input_mut(|input| std::mem::take(&mut input.raw.dropped_files));
        if dropped.is_empty() {
            return;
        }
        let paths: Vec<_> = dropped
            .iter()
            .map(|file| file.path())
            .filter(|path| !path.as_os_str().is_empty())
            .map(|path| self.files.canonicalize(path))
            .collect();
        self.dispatch(ctx, paths.into_iter().map(Command::OpenPath).collect());
    }

    fn apply_style(&mut self, ctx: &egui::Context) {
        if self.style_applied {
            return;
        }
        self.style_applied = true;

        install_cjk_font(ctx);
        ctx.set_theme(egui::ThemePreference::Light);
        let mut visuals = egui::Visuals::light();
        visuals.panel_fill = self.palette.bg;
        visuals.window_fill = self.palette.surface;
        visuals.extreme_bg_color = self.palette.code_bg;
        visuals.faint_bg_color = self.palette.surface;
        visuals.code_bg_color = self.palette.code_bg;
        visuals.override_text_color = Some(self.palette.ink);
        visuals.hyperlink_color = self.palette.link;
        visuals.selection.bg_fill = self.palette.selection;
        visuals.selection.stroke = Stroke::new(1.0, self.palette.ink);
        ctx.set_visuals(visuals);
    }

    fn sync_title(&mut self, ctx: &egui::Context) {
        let title = self.workspace.window_title();
        if self.title_sent.as_deref() != Some(&title) {
            ctx.send_viewport_cmd(ViewportCommand::Title(title.clone()));
            self.title_sent = Some(title);
        }
    }

    /// Creates the expensive editor subsystems on first Edit and keeps the
    /// preview in step with the active document. Preview-only Documents hold
    /// no editor resources at all.
    fn sync_editor_resources(&mut self) {
        let Some((document_id, mode, revision, content, scope)) =
            self.workspace.active_document().map(|document| {
                (
                    document.id,
                    document.mode,
                    document.revision,
                    document.content.clone(),
                    document.image_scope().map(Path::to_path_buf),
                )
            })
        else {
            self.preview = None;
            self.preview_revision = None;
            return;
        };

        match mode {
            Mode::Edit => {
                if self.editor.is_none() {
                    self.editor = Some(EditorResources::new(self.palette));
                }
                self.editor_sessions.entry(document_id).or_default();
            }
            Mode::Preview => {
                let key = (document_id, revision, scope.clone());
                if self.preview_revision != Some(key.clone()) {
                    self.preview = Some(preview::prepare_with_images(
                        &content,
                        scope.as_deref(),
                        self.images.as_ref(),
                    ));
                    self.preview_revision = Some(key);
                }
            }
        }
    }

    fn dispatch(&mut self, ctx: &egui::Context, commands: Vec<Command>) {
        let focus_after = commands.iter().any(|command| {
            matches!(
                command,
                Command::NewUntitled
                    | Command::ActivateTab(_)
                    | Command::SetMode(Mode::Edit)
                    | Command::ToggleMode
                    | Command::CycleTab(_)
            )
        });
        let mut pending: VecDeque<Command> = commands.into();
        while let Some(command) = pending.pop_front() {
            for effect in self.workspace.apply(command) {
                match effect {
                    crate::domain::Effect::ReadFile(path) => {
                        pending.push_back(match self.files.read_utf8(&path) {
                            Ok(content) => Command::FileLoaded { path, content },
                            Err(error) => Command::FileLoadFailed { path, error },
                        });
                    }
                    crate::domain::Effect::WriteFile { path, content } => {
                        pending.push_back(match self.files.write_utf8(&path, &content) {
                            Ok(()) => Command::WriteSucceeded,
                            Err(error) => Command::WriteFailed(error.to_string()),
                        });
                    }
                    crate::domain::Effect::ShowOpenDialog => {
                        if let Some(path) = self.dialogs.open() {
                            let path = self.files.canonicalize(&path);
                            pending.push_back(Command::OpenPath(path));
                        }
                    }
                    crate::domain::Effect::ShowSaveDialog { suggested_name } => {
                        pending.push_back(match self.dialogs.save_as(&suggested_name) {
                            Some(path) => Command::SaveAsChosen(self.files.canonicalize(&path)),
                            None => Command::SaveDialogCancelled,
                        });
                    }
                    crate::domain::Effect::ShowToast(message) => self.show_message(message),
                    crate::domain::Effect::ShowGuard { title } => {
                        pending
                            .push_back(Command::GuardChosen(self.dialogs.confirm_discard(&title)));
                    }
                    crate::domain::Effect::ShowExternalModified { title } => {
                        let choice = self.dialogs.external_modified(&title);
                        let disk_content = if choice == crate::domain::ExternalChoice::Cancel {
                            None
                        } else {
                            self.workspace
                                .active_document()
                                .and_then(|document| document.path.as_deref())
                                .and_then(|path| self.files.read_utf8(path).ok())
                        };
                        pending.push_back(Command::ExternalChosen {
                            choice,
                            disk_content,
                        });
                    }
                    crate::domain::Effect::SetWindowTitle(_) => {}
                    crate::domain::Effect::CloseWindow => {
                        self.allow_close = true;
                        ctx.send_viewport_cmd(ViewportCommand::Close);
                    }
                }
            }
        }
        if focus_after {
            self.focus_editor = self
                .workspace
                .active_document()
                .is_some_and(|document| document.mode == Mode::Edit);
        }
        if self
            .workspace
            .active_document()
            .is_none_or(|document| document.mode != Mode::Edit)
        {
            self.find_open = false;
        }
        self.editor_sessions
            .retain(|document_id, _| self.workspace.document(*document_id).is_some());
        self.sync_editor_resources();
    }

    fn show_message(&mut self, message: impl Into<String>) {
        self.toast = Some(Toast {
            message: message.into(),
            expires_at: Instant::now() + Duration::from_secs(6),
        });
    }

    fn toggle_mode(&mut self, ctx: &egui::Context) {
        self.dispatch(ctx, vec![Command::ToggleMode]);
    }

    fn handle_shortcuts(&mut self, ctx: &egui::Context) -> Vec<Command> {
        if self.workspace.guard().is_some() {
            return Vec::new();
        }

        let edit = self
            .workspace
            .active_document()
            .is_some_and(|document| document.mode == Mode::Edit);
        let (
            save_as,
            save,
            toggle,
            new,
            new_tab,
            open,
            close,
            previous_tab,
            next_tab,
            move_left,
            move_right,
            about,
            format,
            find,
            escape,
        ) = ctx.input_mut(|input| {
            let save_as = input.consume_key(Modifiers::COMMAND.plus(Modifiers::SHIFT), Key::S);
            let save = input.consume_key(Modifiers::COMMAND, Key::S);
            let toggle = input.consume_key(Modifiers::COMMAND, Key::E);
            let new = input.consume_key(Modifiers::COMMAND, Key::N);
            let new_tab = input.consume_key(Modifiers::COMMAND, Key::T);
            let open = input.consume_key(Modifiers::COMMAND, Key::O);
            let close = input.consume_key(Modifiers::COMMAND, Key::W);
            let about = input.consume_key(Modifiers::COMMAND, Key::Slash);
            let format = if edit {
                if input.consume_key(Modifiers::COMMAND, Key::B) {
                    Some(FormatAction::Bold)
                } else if input.consume_key(Modifiers::COMMAND, Key::I) {
                    Some(FormatAction::Italic)
                } else {
                    None
                }
            } else {
                None
            };
            let find = input.consume_key(Modifiers::COMMAND, Key::F);
            let escape = self.find_open
                && !self.about_open
                && input.consume_key(Modifiers::NONE, Key::Escape);
            // Tab cycling is Ctrl-only, never Cmd.
            let previous_tab = input.consume_key(Modifiers::CTRL.plus(Modifiers::SHIFT), Key::Tab);
            let next_tab = input.consume_key(Modifiers::CTRL, Key::Tab);
            let move_left =
                input.consume_key(Modifiers::COMMAND.plus(Modifiers::SHIFT), Key::PageUp);
            let move_right =
                input.consume_key(Modifiers::COMMAND.plus(Modifiers::SHIFT), Key::PageDown);
            (
                save_as,
                save,
                toggle,
                new,
                new_tab,
                open,
                close,
                previous_tab,
                next_tab,
                move_left,
                move_right,
                about,
                format,
                find,
                escape,
            )
        });

        if about {
            self.about_open = true;
        }
        if let Some(action) = format {
            self.apply_format(ctx, action);
        }

        let mut switch_to_edit = false;
        if find && self.workspace.active_document().is_some() {
            self.find_open = true;
            self.focus_find = true;
            switch_to_edit = self
                .workspace
                .active_document()
                .is_some_and(|document| document.mode == Mode::Preview);
        }
        if escape {
            self.find_open = false;
            self.focus_editor = true;
        }

        let active = self.workspace.active_document().map(|document| document.id);
        let active_index = active.and_then(|id| {
            self.workspace
                .tabs()
                .iter()
                .position(|tab| tab.document.id == id)
        });

        let mut commands = Vec::new();
        if switch_to_edit {
            commands.push(Command::SetMode(Mode::Edit));
        }
        if save_as {
            commands.push(Command::SaveAs);
        } else if save {
            commands.push(Command::Save);
        }
        if toggle {
            commands.push(Command::ToggleMode);
        }
        if new {
            commands.push(Command::NewUntitled);
        }
        if new_tab {
            commands.push(Command::NewUntitled);
        }
        if open {
            commands.push(Command::Open);
        }
        if close && let Some(id) = active {
            commands.push(Command::CloseTab(id));
        }
        if previous_tab {
            commands.push(Command::CycleTab(-1));
        } else if next_tab {
            commands.push(Command::CycleTab(1));
        }
        if let (Some(id), Some(index)) = (active, active_index) {
            if move_left && index > 0 {
                commands.push(Command::MoveTab {
                    from: id,
                    to: index - 1,
                });
            }
            if move_right && index + 1 < self.workspace.tabs().len() {
                commands.push(Command::MoveTab {
                    from: id,
                    to: index + 1,
                });
            }
        }
        commands
    }

    /// Format the saved editor selection. This runs before the editor paints,
    /// while the last frame's selection is still intact and one undo point can
    /// hold both sides of the change.
    fn apply_format(&mut self, ctx: &egui::Context, action: FormatAction) {
        let Some(document) = self.workspace.active_document() else {
            return;
        };
        if document.mode != Mode::Edit {
            return;
        }
        let document_id = document.id;
        let text = document.content.clone();
        let editor_id = editor_id(document_id);
        let Some(mut state) = TextEditState::load(ctx, editor_id) else {
            return;
        };
        let Some(cursor_range) = state.cursor.char_range() else {
            return;
        };
        let selection = cursor_range.as_sorted_char_range();
        let selection = selection.start.0..selection.end.0;
        let formatted = action.apply(&text, selection.clone());
        if formatted.text == text && formatted.selection == selection {
            return;
        }

        let range = CCursorRange::two(
            CCursor::new(formatted.selection.start),
            CCursor::new(formatted.selection.end),
        );
        let mut undoer = state.undoer();
        undoer.add_undo(&(cursor_range, text));
        undoer.add_undo(&(range, formatted.text.clone()));
        state.set_undoer(undoer);
        state.cursor.set_char_range(Some(range));
        state.store(ctx, editor_id);

        self.pending_selection = Some((document_id, formatted.selection.clone()));
        self.dispatch(
            ctx,
            vec![Command::ContentChanged {
                document_id,
                content: formatted.text,
            }],
        );
    }

    fn check_external(&mut self, ctx: &egui::Context) {
        let focused = ctx.input(|input| input.focused);
        let active = self.workspace.active_document().map(|document| document.id);
        let guard_open = self.workspace.guard().is_some();
        let trigger = (focused && !self.was_focused)
            || active != self.last_active
            || (self.was_guard_open && !guard_open);
        self.was_focused = focused;
        self.last_active = active;
        self.was_guard_open = guard_open;

        if !trigger
            || guard_open
            || self.workspace.external_modified_open()
            || self.workspace.save_dialog_open()
        {
            return;
        }
        let Some(document) = self.workspace.active_document() else {
            return;
        };
        let Some(path) = document.path.as_deref() else {
            return;
        };
        let document_id = document.id;
        // A missing or unreadable file is not an external modification.
        if let Ok(content) = self.files.read_utf8(path) {
            self.dispatch(
                ctx,
                vec![Command::ExternalCheck {
                    document_id,
                    content,
                }],
            );
        }
    }

    fn handle_close_request(&mut self, ctx: &egui::Context) {
        let requested = ctx.input(|input| input.viewport().close_requested());
        if !requested || self.allow_close {
            return;
        }

        self.dispatch(ctx, vec![Command::WindowCloseRequested]);
        if !self.allow_close {
            ctx.send_viewport_cmd(ViewportCommand::CancelClose);
        }
    }

    fn show_tab_bar(&self, ui: &mut Ui) -> Vec<Command> {
        let active = self.workspace.active_document().map(|document| document.id);
        let tabs: Vec<(DocumentId, String, bool)> = self
            .workspace
            .tabs()
            .iter()
            .map(|tab| {
                let id = tab.document.id;
                (id, self.workspace.tab_label(id), Some(id) == active)
            })
            .collect();
        if tabs.is_empty() {
            return Vec::new();
        }

        let mut commands = Vec::new();
        Panel::top("tab_bar")
            .frame(
                Frame::new()
                    .fill(self.palette.surface)
                    .stroke(Stroke::new(1.0, self.palette.border))
                    .inner_margin(Margin::symmetric(12, 6)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let mut rects = Vec::new();
                    let mut dragged = None;
                    for (id, label, is_active) in &tabs {
                        ui.horizontal(|ui| {
                            let response = ui.add(
                                egui::Button::new(
                                    RichText::new(label).monospace().color(self.palette.ink),
                                )
                                .frame(false)
                                .sense(Sense::click_and_drag()),
                            );
                            if response.clicked() && !response.dragged() {
                                commands.push(Command::ActivateTab(*id));
                            }
                            if response.dragged() {
                                dragged = Some(*id);
                            }
                            if *is_active {
                                ui.painter().hline(
                                    response.rect.x_range(),
                                    response.rect.bottom() + 2.0,
                                    Stroke::new(1.0, self.palette.accent),
                                );
                            }
                            let close = ui.add(
                                egui::Button::new(RichText::new("×").color(self.palette.muted))
                                    .frame(false)
                                    .small(),
                            );
                            if close.clicked() {
                                commands.push(Command::CloseTab(*id));
                            }
                            rects.push((*id, response.rect));
                        });
                    }

                    if let Some(from) = dragged
                        && let Some(pointer) = ui.ctx().input(|input| input.pointer.interact_pos())
                    {
                        let to = rects
                            .iter()
                            .position(|(_, rect)| pointer.x < rect.center().x)
                            .unwrap_or(rects.len() - 1);
                        if let Some(current) = tabs.iter().position(|(id, _, _)| *id == from)
                            && to != current
                        {
                            commands.push(Command::MoveTab { from, to });
                        }
                    }
                });
            });
        commands
    }

    fn show_toolbar(&mut self, ui: &mut Ui) -> Vec<Command> {
        let Some(document) = self.workspace.active_document() else {
            return Vec::new();
        };
        let mode = document.mode;
        let mut commands = Vec::new();
        let mut format = None;

        Panel::top("toolbar")
            .frame(
                Frame::new()
                    .fill(self.palette.bg)
                    .inner_margin(Margin::symmetric(12, 5)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    if ui.button("New").clicked() {
                        commands.push(Command::NewUntitled);
                    }
                    if ui.button("Open").clicked() {
                        commands.push(Command::Open);
                    }
                    ui.separator();
                    if ui
                        .selectable_label(mode == Mode::Preview, "Preview")
                        .clicked()
                    {
                        commands.push(Command::SetMode(Mode::Preview));
                    }
                    if ui.selectable_label(mode == Mode::Edit, "Edit").clicked() {
                        commands.push(Command::SetMode(Mode::Edit));
                    }
                    if mode == Mode::Edit {
                        ui.separator();
                        for (label, action) in [
                            ("Bold", FormatAction::Bold),
                            ("Italic", FormatAction::Italic),
                            ("Heading", FormatAction::Heading),
                            ("List", FormatAction::List),
                            ("Link", FormatAction::Link),
                            ("Code", FormatAction::Code),
                        ] {
                            if ui.button(label).clicked() {
                                format = Some(action);
                            }
                        }
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("About").clicked() {
                            self.about_open = true;
                        }
                        if ui.button("Save As").clicked() {
                            commands.push(Command::SaveAs);
                        }
                        if ui.button("Save").clicked() {
                            commands.push(Command::Save);
                        }
                    });
                });
            });
        if let Some(action) = format {
            self.apply_format(ui.ctx(), action);
        }
        commands
    }

    fn show_document(&mut self, root: &mut Ui) {
        let mode = self
            .workspace
            .active_document()
            .map(|document| document.mode);

        CentralPanel::default()
            .frame(Frame::new().fill(if mode == Some(Mode::Edit) {
                self.palette.surface
            } else {
                self.palette.bg
            }))
            .show(root, |ui| match mode {
                Some(Mode::Edit) => self.show_editor(ui),
                Some(Mode::Preview) => self.show_preview(ui),
                None => self.show_empty(ui),
            });
    }

    fn show_editor(&mut self, ui: &mut Ui) {
        let Some(document) = self.workspace.active_document() else {
            return;
        };
        let document_id = document.id;
        let mut content = document.content.clone();

        let focus = std::mem::take(&mut self.focus_editor);
        let pending_selection = match self.pending_selection.take() {
            Some((id, range)) if id == document_id => Some(range),
            other => {
                self.pending_selection = other;
                None
            }
        };
        let changed = {
            let Some(editor) = self.editor.as_ref() else {
                return;
            };
            let session = self.editor_sessions.entry(document_id).or_default();
            let highlighter = &editor.highlighter;
            let font = editor.font.clone();
            let mut layouter = |ui: &Ui, buffer: &dyn TextBuffer, wrap_width: f32| {
                highlighter.layout(ui, buffer.as_str(), wrap_width, &mut session.cache)
            };

            ScrollArea::vertical()
                .id_salt(("editor_scroll", document_id))
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let min_size = ui.available_size();
                    let output = TextEdit::multiline(&mut content)
                        .id(editor_id(document_id))
                        .font(font)
                        .desired_width(f32::INFINITY)
                        .desired_rows(1)
                        .min_size(min_size)
                        .frame(
                            Frame::new()
                                .fill(self.palette.surface)
                                .inner_margin(Margin::symmetric(18, 14)),
                        )
                        .hint_text("Write Markdown…")
                        .layouter(&mut layouter)
                        .show(ui);
                    if let Some(range) = pending_selection {
                        if let Some(mut state) =
                            TextEditState::load(ui.ctx(), editor_id(document_id))
                        {
                            state.cursor.set_char_range(Some(CCursorRange::two(
                                CCursor::new(range.start),
                                CCursor::new(range.end),
                            )));
                            state.store(ui.ctx(), editor_id(document_id));
                        }
                        output.response.request_focus();
                    }
                    if focus {
                        output.response.request_focus();
                    }
                    output.response.changed()
                })
                .inner
        };

        if changed {
            let ctx = ui.ctx().clone();
            self.dispatch(
                &ctx,
                vec![Command::ContentChanged {
                    document_id,
                    content,
                }],
            );
        }
    }

    fn show_preview(&mut self, ui: &mut Ui) {
        let palette = self.palette;
        let first_frame = self.frame_count == 0;
        let preview = self.preview.as_ref();
        let document_id = self.workspace.active_document().map(|document| document.id);
        let cache = &mut self.cache;

        Frame::new()
            .fill(palette.bg)
            .inner_margin(Margin::symmetric(28, 20))
            .show(ui, |ui| {
                if let (Some(preview), Some(document_id)) = (preview, document_id) {
                    let code_blocks = preview.code_blocks.clone();
                    let render_code = move |ui: &mut Ui, html: &str| {
                        if let Some(index) = code_sentinel_index(html)
                            && let Some(code) = code_blocks.get(index)
                        {
                            show_code_block(ui, &palette, code, index);
                        }
                    };
                    ScrollArea::vertical()
                        .id_salt(preview_scroll_id(document_id))
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            let markdown = if first_frame {
                                preview
                                    .first_frame_render_markdown
                                    .as_deref()
                                    .unwrap_or(&preview.render_markdown)
                            } else {
                                &preview.render_markdown
                            };
                            CommonMarkViewer::new()
                                .render_html_fn(Some(&render_code))
                                .show(ui, cache, markdown);
                        });
                } else {
                    ui.centered_and_justified(|ui| {
                        ui.add(
                            Label::new(
                                RichText::new("No document open")
                                    .size(18.0)
                                    .color(palette.muted),
                            )
                            .selectable(false),
                        );
                    });
                }
            });
    }

    fn show_empty(&self, ui: &mut Ui) {
        ui.centered_and_justified(|ui| {
            ui.add(
                Label::new(
                    RichText::new("No document open")
                        .size(18.0)
                        .color(self.palette.muted),
                )
                .selectable(false),
            );
        });
    }

    fn show_about(&mut self, ctx: &egui::Context) {
        if !self.about_open {
            return;
        }

        let mut close = false;
        let mut open_repository = false;
        Modal::new(Id::unique("about")).show(ctx, |ui| {
            ui.set_max_width(560.0);
            ui.heading("Markdown Hexer");
            ui.label(format!("Version {}", env!("CARGO_PKG_VERSION")));
            ui.horizontal(|ui| {
                ui.label("Repository:");
                if ui.link(REPOSITORY).clicked() {
                    open_repository = true;
                }
            });
            ui.add_space(10.0);
            ui.heading("Shortcuts");
            egui::Grid::new("about_shortcuts")
                .num_columns(2)
                .striped(true)
                .show(ui, |ui| {
                    for (action, shortcut) in [
                        ("New", "Ctrl+N"),
                        ("Open", "Ctrl+O"),
                        ("Save", "Ctrl+S"),
                        ("Save As", "Ctrl+Shift+S"),
                        ("Close Tab", "Ctrl+W"),
                        ("New Tab", "Ctrl+T"),
                        ("Next Tab", "Ctrl+Tab"),
                        ("Previous Tab", "Ctrl+Shift+Tab"),
                        ("Move Tab Left", "Ctrl+Shift+PgUp"),
                        ("Move Tab Right", "Ctrl+Shift+PgDn"),
                        ("Toggle Preview/Edit", "Ctrl+E"),
                        ("Find", "Ctrl+F"),
                        ("Bold", "Ctrl+B"),
                        ("Italic", "Ctrl+I"),
                        ("About", "Ctrl+/"),
                    ] {
                        ui.label(action);
                        ui.label(RichText::new(shortcut).monospace());
                        ui.end_row();
                    }
                });
            ui.add_space(12.0);
            if ui.button("Close").clicked() {
                close = true;
            }
        });

        if ctx.input(|input| input.key_pressed(Key::Escape)) {
            close = true;
        }
        if open_repository && !crate::platform::open_url(REPOSITORY) {
            self.show_message("Could not open the repository link");
        }
        if close {
            self.about_open = false;
        }
    }

    fn handle_open_urls(&mut self, ctx: &egui::Context) {
        let commands = ctx.output_mut(|output| std::mem::take(&mut output.commands));
        let mut kept = Vec::with_capacity(commands.len());
        for command in commands {
            let egui::OutputCommand::OpenUrl(open) = command else {
                kept.push(command);
                continue;
            };
            if crate::platform::open_url(&open.url) {
                continue;
            }
            if crate::platform::is_allowed_url(&open.url) {
                self.show_message("Could not open link");
            }
        }
        ctx.output_mut(|output| output.commands = kept);
    }

    fn show_toast(&mut self, ctx: &egui::Context) {
        if self
            .toast
            .as_ref()
            .is_some_and(|toast| toast.expires_at <= Instant::now())
        {
            self.toast = None;
        }

        let Some(toast) = &self.toast else {
            return;
        };
        let palette = self.palette;

        egui::Area::new(egui::Id::unique("toast"))
            .anchor(Align2::CENTER_BOTTOM, egui::vec2(0.0, -24.0))
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                Frame::new()
                    .fill(palette.surface)
                    .stroke(Stroke::new(1.0, palette.border))
                    .inner_margin(Margin::symmetric(16, 10))
                    .show(ui, |ui| {
                        ui.set_max_width(560.0);
                        ui.add(Label::new(RichText::new(&toast.message).color(palette.ink)).wrap());
                    });
            });

        let remaining = toast.expires_at.saturating_duration_since(Instant::now());
        ctx.request_repaint_after(remaining);
    }
}

impl eframe::App for HexerApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let mut first_edit_start = None;
        if self.frame_count == 1
            && self.first_edit.as_ref().is_some_and(|probe| probe.armed())
            && self
                .workspace
                .active_document()
                .is_some_and(|document| document.mode == Mode::Preview)
        {
            first_edit_start = Some(Instant::now());
            if let Some(probe) = self.first_edit.as_mut() {
                probe.take_trigger();
            }
            self.toggle_mode(&ctx);
        }

        self.apply_style(&ctx);
        self.drain_instance(&ctx);
        self.handle_dropped_files(&ctx);
        self.sync_title(&ctx);
        self.sync_editor_resources();

        // Commands are collected and dispatched after the editor has handed
        // this frame's content to the Workspace, so Save never writes stale text.
        let mut commands = self.handle_shortcuts(&ctx);
        commands.extend(self.show_tab_bar(ui));
        if self.workspace.guard().is_none() {
            commands.extend(self.show_toolbar(ui));
            commands.extend(self.show_find_panel(ui));
        }
        // Mode, Tab, and New/Open commands can run before painting so the new
        // state is visible this frame. Save and close must wait for the editor.
        let (deferred, immediate): (Vec<_>, Vec<_>) = commands.into_iter().partition(|command| {
            matches!(
                command,
                Command::Save | Command::SaveAs | Command::CloseTab(_) | Command::GuardChosen(_)
            )
        });
        self.dispatch(&ctx, immediate);
        self.show_document(ui);
        self.dispatch(&ctx, deferred);
        self.handle_close_request(&ctx);
        self.check_external(&ctx);
        self.show_about(&ctx);
        self.show_toast(&ctx);
        self.handle_open_urls(&ctx);

        if self.frame_count == 0 {
            // eframe shows the window only after this frame has painted, so the
            // first submitted frame is also the first readable frame.
            self.timer.mark_visible();
            self.timer.mark_readable();

            // Startup notices are deliberately shown after the first frame so
            // they never delay the first paint.
            if let Some(message) = self.pending_toast.take() {
                self.show_message(message);
                ctx.request_repaint();
            }

            if self.first_edit.is_some() {
                ctx.request_repaint();
            }
        }
        if let Some(start) = first_edit_start {
            if let Some(probe) = &self.first_edit
                && let Err(error) = probe.record(start.elapsed())
            {
                eprintln!("markdown-hexer: first-edit log failed: {error}");
            }
            self.allow_close = true;
            ctx.send_viewport_cmd(ViewportCommand::Close);
        }
        self.frame_count += 1;
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        self.palette.bg.to_normalized_gamma_f32()
    }
}

fn code_sentinel_index(html: &str) -> Option<usize> {
    html.trim()
        .strip_prefix("<div data-hexer-code=\"")?
        .strip_suffix("\"></div>")?
        .parse()
        .ok()
}

fn code_theme(style: &egui::Style, palette: &Palette) -> CodeTheme {
    let mut theme = CodeTheme::light(egui::TextStyle::Monospace.resolve(style).size);
    theme.format_mut(TokenType::Comment).color = palette.syntax_comment;
    theme.format_mut(TokenType::Keyword).color = palette.syntax_keyword;
    theme.format_mut(TokenType::StringLiteral).color = palette.syntax_string;
    theme.format_mut(TokenType::Literal).color = palette.syntax_number;
    theme.format_mut(TokenType::Function).color = palette.syntax_function;
    theme.format_mut(TokenType::Punctuation).color = palette.ink;
    theme
}

fn code_layout_job(
    ctx: &egui::Context,
    style: &egui::Style,
    palette: &Palette,
    code: &FencedCode,
) -> LayoutJob {
    highlight(
        ctx,
        style,
        &code_theme(style, palette),
        &code.text,
        code.language.as_deref().unwrap_or(""),
    )
}

fn show_code_block(
    ui: &mut Ui,
    palette: &Palette,
    code: &FencedCode,
    index: usize,
) -> (egui::Response, egui::Response) {
    let mut content = None;
    let frame = Frame::new()
        .fill(palette.code_bg)
        .stroke(Stroke::new(1.0, palette.border))
        .corner_radius(4)
        .inner_margin(Margin::symmetric(10, 8))
        .show(ui, |ui| {
            ScrollArea::horizontal()
                .id_salt(("preview_code_scroll", index))
                .auto_shrink([false, true])
                .show(ui, |ui| {
                    let job = code_layout_job(ui.ctx(), ui.style(), palette, code);
                    content = Some(
                        ui.add(
                            Label::new(job)
                                .selectable(true)
                                .wrap_mode(TextWrapMode::Extend),
                        ),
                    );
                });
        });
    ui.add_space(4.0);
    (
        frame.response,
        content.expect("code block content is rendered"),
    )
}

#[cfg(test)]
mod tests;
