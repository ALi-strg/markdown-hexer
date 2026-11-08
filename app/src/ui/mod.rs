mod palette;

pub use palette::Palette;

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use egui::{
    Align2, CentralPanel, Frame, Id, Key, Label, Margin, Modal, Modifiers, Panel, RichText,
    ScrollArea, Sense, Stroke, TextBuffer, TextEdit, Ui, ViewportCommand,
};
use egui_commonmark::CommonMarkViewer;

use crate::dialogs::{Dialogs, NativeDialogs};
use crate::domain::{Command, DocumentId, GuardChoice, Mode, Workspace};
use crate::editor::{EditorResources, EditorSession};
use crate::first_edit::FirstEditProbe;
use crate::platform::{FileSystem, NativeFileSystem};
use crate::preview::{self, PreparedPreview};
use crate::startup::{Startup, StartupTimer};

pub struct HexerApp {
    workspace: Workspace,
    preview: Option<PreparedPreview>,
    preview_revision: Option<(DocumentId, u64)>,
    cache: egui_commonmark::CommonMarkCache,
    palette: Palette,
    editor: Option<EditorResources>,
    editor_sessions: HashMap<DocumentId, EditorSession>,
    focus_editor: bool,
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
}

struct Toast {
    message: String,
    expires_at: Instant,
}

fn preview_scroll_id(document_id: DocumentId) -> Id {
    Id::unique(("preview_scroll", document_id))
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
        let workspace = startup.workspace;
        let active = workspace.active_document();
        let preview = active
            .filter(|document| document.mode == Mode::Preview)
            .map(|document| preview::prepare(&document.content));
        let preview_revision = active
            .filter(|document| document.mode == Mode::Preview && preview.is_some())
            .map(|document| (document.id, document.revision));
        let focus_editor = active.is_some_and(|document| document.mode == Mode::Edit);

        let mut app = Self {
            workspace,
            preview,
            preview_revision,
            cache: egui_commonmark::CommonMarkCache::default(),
            palette: Palette::default_light(),
            editor: None,
            editor_sessions: HashMap::new(),
            focus_editor,
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
        };
        app.sync_editor_resources();
        app
    }

    fn apply_style(&mut self, ctx: &egui::Context) {
        if self.style_applied {
            return;
        }
        self.style_applied = true;

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
        let Some((document_id, mode, revision, content)) =
            self.workspace.active_document().map(|document| {
                (
                    document.id,
                    document.mode,
                    document.revision,
                    document.content.clone(),
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
                let key = (document_id, revision);
                if self.preview_revision != Some(key) {
                    self.preview = Some(preview::prepare(&content));
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
        ) = ctx.input_mut(|input| {
            let save_as = input.consume_key(Modifiers::COMMAND.plus(Modifiers::SHIFT), Key::S);
            let save = input.consume_key(Modifiers::COMMAND, Key::S);
            let toggle = input.consume_key(Modifiers::COMMAND, Key::E);
            let new = input.consume_key(Modifiers::COMMAND, Key::N);
            let new_tab = input.consume_key(Modifiers::COMMAND, Key::T);
            let open = input.consume_key(Modifiers::COMMAND, Key::O);
            let close = input.consume_key(Modifiers::COMMAND, Key::W);
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
            )
        });

        let active = self.workspace.active_document().map(|document| document.id);
        let active_index = active.and_then(|id| {
            self.workspace
                .tabs()
                .iter()
                .position(|tab| tab.document.id == id)
        });

        let mut commands = Vec::new();
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

    fn show_toolbar(&self, ui: &mut Ui) -> Vec<Command> {
        let Some(document) = self.workspace.active_document() else {
            return Vec::new();
        };
        let mode = document.mode;
        let mut commands = Vec::new();

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

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("Save As").clicked() {
                            commands.push(Command::SaveAs);
                        }
                        if ui.button("Save").clicked() {
                            commands.push(Command::Save);
                        }
                    });
                });
            });
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
        let revision = document.revision;
        let mut content = document.content.clone();

        let focus = std::mem::take(&mut self.focus_editor);
        let changed = {
            let Some(editor) = self.editor.as_ref() else {
                return;
            };
            let session = self.editor_sessions.entry(document_id).or_default();
            let highlighter = &editor.highlighter;
            let font = editor.font.clone();
            let mut layouter = |ui: &Ui, buffer: &dyn TextBuffer, wrap_width: f32| {
                highlighter.layout(
                    ui,
                    buffer.as_str(),
                    revision,
                    wrap_width,
                    &mut session.cache,
                )
            };

            ScrollArea::vertical()
                .id_salt(("editor_scroll", document_id))
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let min_size = ui.available_size();
                    let output = TextEdit::multiline(&mut content)
                        .id(Id::unique(("markdown_editor", document_id)))
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
        let preview = self.preview.as_ref();
        let document_id = self.workspace.active_document().map(|document| document.id);
        let cache = &mut self.cache;

        Frame::new()
            .fill(palette.bg)
            .inner_margin(Margin::symmetric(28, 20))
            .show(ui, |ui| {
                if let (Some(preview), Some(document_id)) = (preview, document_id) {
                    ScrollArea::vertical()
                        .id_salt(preview_scroll_id(document_id))
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            CommonMarkViewer::new().show(ui, cache, &preview.markdown);
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

    fn show_guard(&mut self, ctx: &egui::Context) {
        let Some(title) = self.workspace.guard().map(|guard| guard.title.clone()) else {
            return;
        };

        let mut choice = None;
        Modal::new(Id::unique("close_guard")).show(ctx, |ui| {
            ui.set_max_width(420.0);
            ui.heading("Unsaved changes");
            ui.add_space(8.0);
            ui.label(format!("Save changes to {title}?"));
            ui.add_space(14.0);
            ui.horizontal(|ui| {
                if ui.button("Save").clicked() {
                    choice = Some(GuardChoice::Save);
                }
                if ui.button("Don't Save").clicked() {
                    choice = Some(GuardChoice::DontSave);
                }
                if ui.button("Cancel").clicked() {
                    choice = Some(GuardChoice::Cancel);
                }
            });
        });

        if let Some(choice) = choice {
            self.dispatch(ctx, vec![Command::GuardChosen(choice)]);
        }
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
        self.sync_title(&ctx);
        self.sync_editor_resources();

        // Commands are collected and dispatched after the editor has handed
        // this frame's content to the Workspace, so Save never writes stale text.
        let mut commands = self.handle_shortcuts(&ctx);
        commands.extend(self.show_tab_bar(ui));
        if self.workspace.guard().is_none() {
            commands.extend(self.show_toolbar(ui));
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
        self.show_guard(&ctx);
        self.show_toast(&ctx);

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

#[cfg(test)]
mod tests;
