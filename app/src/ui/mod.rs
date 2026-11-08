mod find;
mod palette;

pub use palette::Palette;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::{Duration, Instant};

use egui::text::{CCursor, CCursorRange, LayoutJob};
use egui::widgets::text_edit::TextEditState;
use egui::{
    Align2, CentralPanel, FontFamily, Frame, Id, Key, Label, Margin, Modal, Modifiers, Panel,
    RichText, Role, ScrollArea, Sense, Stroke, TextBuffer, TextEdit, TextWrapMode, Ui,
    ViewportCommand, WidgetInfo,
};
use egui_commonmark::CommonMarkViewer;
use egui_extras::syntax_highlighting::highlight;

use crate::dialogs::{Dialogs, NativeDialogs};
use crate::domain::{Command, DocumentId, Mode, Workspace};
use crate::editor::{EditorResources, EditorSession};
use crate::export::{self, ExportOptions};
use crate::first_edit::FirstEditProbe;
use crate::format::FormatAction;
use crate::image::{ImageSource, NativeImageSource};
use crate::platform::instance::InstanceServer;
use crate::platform::{Clipboard, FileSystem, NativeClipboard, NativeFileSystem};
use crate::preview::{self, FencedCode, PreparedPreview};
use crate::sections::{Section, SectionState, Sections};
use crate::settings::{
    CONTENT_MONO, CONTENT_SANS, CONTENT_SERIF, FontChoice, Settings, TextSize, Theme,
};
use crate::startup::{Startup, StartupTimer};
use std::ops::Range;

const REPOSITORY: &str = "https://github.com/ALi-strg/markdown-hexer";

pub struct HexerApp {
    workspace: Workspace,
    preview: Option<PreparedPreview>,
    preview_revision: Option<PreviewKey>,
    sections: SectionState,
    images: Box<dyn ImageSource>,
    cache: egui_commonmark::CommonMarkCache,
    palette: Palette,
    settings: Settings,
    settings_path: Option<PathBuf>,
    editor: Option<EditorResources>,
    editor_sessions: HashMap<DocumentId, EditorSession>,
    focus_editor: bool,
    focus_preview: bool,
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
    clipboard: Box<dyn Clipboard>,
    allow_close: bool,
    first_edit: Option<FirstEditProbe>,
    instance: Option<InstanceServer>,
    instance_wake: bool,
    about_open: bool,
    focus_about: bool,
    tab_keyboard: bool,
    pending_tab_focus: Option<Id>,
    focus_window: bool,
    last_active: Option<DocumentId>,
    was_focused: bool,
    was_guard_open: bool,
}

struct Toast {
    message: String,
    expires_at: Instant,
}

/// Collects settled label selections after the pass, when the app can no
/// longer see the output commands itself.
#[derive(Default)]
struct CopyOnSelect {
    enabled: bool,
    settled: Option<String>,
}

impl egui::Plugin for CopyOnSelect {
    fn debug_name(&self) -> &'static str {
        "CopyOnSelect"
    }

    fn output_hook(&mut self, ctx: &egui::Context, output: &mut egui::FullOutput) {
        if !self.enabled
            || ctx.viewport_id() != egui::ViewportId::ROOT
            || !ctx.input(|input| input.pointer.any_released())
        {
            return;
        }
        // A single click also settles a label selection (and would copy it);
        // only a drag or double-click is a deliberate copy gesture.
        let deliberate = ctx.input(|input| {
            input
                .pointer
                .button_double_clicked(egui::PointerButton::Primary)
                || input.pointer.is_decidedly_dragging()
        });
        if !deliberate {
            return;
        }
        // Read only: the command stays in the output so the OS still gets the
        // primary selection.
        for command in &output.platform_output.commands {
            if let egui::OutputCommand::TextSelectionSettled(text) = command
                && !text.is_empty()
            {
                self.settled = Some(text.clone());
                ctx.request_repaint();
            }
        }
    }
}

type PreviewKey = (DocumentId, u64, Option<PathBuf>);

/// The bundled fonts have no CJK glyphs, so composition previews would draw
/// tofu (or panic in tests). Load one system CJK face as a fallback and register
/// a small set of known content faces. This is a short path list, not a scan.
fn install_fonts(ctx: &egui::Context) {
    fn first_existing(paths: &[&str]) -> Option<Vec<u8>> {
        paths.iter().find_map(|path| std::fs::read(path).ok())
    }

    let cjk_candidates: &[&str] = if cfg!(windows) {
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
    let (serif_paths, sans_paths, mono_paths): (&[&str], &[&str], &[&str]) = if cfg!(windows) {
        (
            &[
                r"C:\Windows\Fonts\georgia.ttf",
                r"C:\Windows\Fonts\times.ttf",
            ],
            &[
                r"C:\Windows\Fonts\segoeui.ttf",
                r"C:\Windows\Fonts\arial.ttf",
            ],
            &[
                r"C:\Windows\Fonts\consola.ttf",
                r"C:\Windows\Fonts\cour.ttf",
            ],
        )
    } else if cfg!(target_os = "macos") {
        (
            &[
                "/System/Library/Fonts/Supplemental/Georgia.ttf",
                "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
            ],
            &[
                "/System/Library/Fonts/Helvetica.ttc",
                "/System/Library/Fonts/Supplemental/Arial.ttf",
            ],
            &[
                "/System/Library/Fonts/Menlo.ttc",
                "/System/Library/Fonts/Supplemental/Courier New.ttf",
            ],
        )
    } else {
        (
            &[
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            ],
            &[
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            ],
            &[
                "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            ],
        )
    };

    let mut fonts = egui::FontDefinitions::default();
    let mut cjk_loaded = false;
    if let Some(bytes) = first_existing(cjk_candidates) {
        fonts.font_data.insert(
            "cjk-fallback".to_owned(),
            std::sync::Arc::new(egui::FontData::from_owned(bytes)),
        );
        cjk_loaded = true;
    }
    if cjk_loaded {
        for family in [FontFamily::Proportional, FontFamily::Monospace] {
            fonts
                .families
                .entry(family)
                .or_default()
                .push("cjk-fallback".to_owned());
        }
    }

    let proportional = fonts
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();
    let monospace = fonts
        .families
        .get(&FontFamily::Monospace)
        .cloned()
        .unwrap_or_default();
    for (name, role, candidates, fallback) in [
        (
            CONTENT_SERIF,
            "content-serif-face",
            serif_paths,
            &proportional,
        ),
        (CONTENT_SANS, "content-sans-face", sans_paths, &proportional),
        (CONTENT_MONO, "content-mono-face", mono_paths, &monospace),
    ] {
        let mut families = Vec::new();
        if let Some(bytes) = first_existing(candidates) {
            fonts.font_data.insert(
                role.to_owned(),
                std::sync::Arc::new(egui::FontData::from_owned(bytes)),
            );
            families.push(role.to_owned());
        }
        families.extend(fallback.iter().cloned());
        fonts
            .families
            .insert(FontFamily::Name(name.into()), families);
    }
    ctx.set_fonts(fonts);
}

fn preview_scroll_id(document_id: DocumentId) -> Id {
    Id::unique(("preview_scroll", document_id))
}

fn apply_preview_text_style(ui: &mut Ui, font: FontChoice, text_size: TextSize) {
    let family = font.preview_family();
    let body = text_size.preview_size();
    let styles = &mut ui.style_mut().text_styles;
    let heading = styles
        .get(&egui::TextStyle::Heading)
        .map_or(24.0, |font| font.size);
    styles.insert(
        egui::TextStyle::Body,
        egui::FontId::new(body, family.clone()),
    );
    styles.insert(
        egui::TextStyle::Heading,
        egui::FontId::new(heading * body / TextSize::Medium.preview_size(), family),
    );
    if let Some(monospace) = styles.get_mut(&egui::TextStyle::Monospace) {
        monospace.size = body;
    }
}

/// The active Layout Mode is the accent control in the toolbar, matching v1's
/// layout switcher. Inactive modes stay on the surface token.
fn mode_toggle(ui: &mut Ui, palette: Palette, label: &str, active: bool) -> bool {
    let text = RichText::new(label).color(if active {
        palette.accent_contrast
    } else {
        palette.ink
    });
    let fill = if active {
        palette.accent
    } else {
        palette.surface
    };
    let response = ui.add(
        egui::Button::new(text)
            .selected(active)
            .fill(fill)
            .stroke(Stroke::new(1.0, palette.border)),
    );
    // The active fill is the accent token, which can equal the focus token, so
    // the framed focus stroke is not always visible. Add the ring outside.
    response.widget_info(|| WidgetInfo::selected(Role::RadioButton, true, active, label));
    paint_focus_ring(ui, &response, palette);
    response.clicked()
}

fn system_is_dark(ctx: &egui::Context) -> bool {
    ctx.system_theme() == Some(egui::Theme::Dark)
}

fn editor_id(document_id: DocumentId) -> Id {
    Id::unique(("markdown_editor", document_id))
}

fn preview_region_id(document_id: DocumentId) -> Id {
    Id::unique(("preview_region", document_id))
}

/// Custom widgets paint no frame stroke, so they get the same 2 px focus ring
/// that framed widgets receive from the active visuals.
fn paint_focus_ring(ui: &Ui, response: &egui::Response, palette: Palette) {
    if response.has_focus() {
        ui.painter().rect_stroke(
            response.rect.expand(1.0),
            egui::CornerRadius::same(3),
            Stroke::new(2.0, palette.focus),
            egui::StrokeKind::Outside,
        );
    }
}

/// The visible tab label carries a ` *` dirty marker; the spoken name says it
/// in words instead.
fn tab_accessible_name(label: &str) -> String {
    match label.split_once(" *") {
        Some((title, rest)) => format!("{title}{rest}, unsaved changes"),
        None => label.to_owned(),
    }
}

fn tab_title(label: &str) -> String {
    label.replacen(" *", "", 1)
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
            sections: SectionState::default(),
            images,
            cache: egui_commonmark::CommonMarkCache::default(),
            palette: Palette::default_light(),
            settings: Settings::default(),
            settings_path: None,
            editor: None,
            editor_sessions: HashMap::new(),
            focus_editor,
            focus_preview: false,
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
            clipboard: Box::new(NativeClipboard::default()),
            allow_close: false,
            first_edit: FirstEditProbe::from_env(),
            instance: None,
            instance_wake: false,
            about_open: false,
            focus_about: false,
            tab_keyboard: false,
            pending_tab_focus: None,
            focus_window: false,
            last_active: None,
            was_focused: false,
            was_guard_open: false,
        };
        app.sync_editor_resources();
        app
    }

    /// Inject a loaded settings snapshot (and the file it came from). This is
    /// also the seam tests use to start with any appearance.
    pub fn with_settings(mut self, settings: Settings, path: Option<PathBuf>) -> Self {
        self.palette = settings.theme.palette(false);
        self.settings = settings;
        self.settings_path = path;
        self.editor = None;
        self.editor_sessions.clear();
        self.sync_editor_resources();
        self
    }

    /// Resolve System from the OS before the first frame is submitted. eframe
    /// also starts the window hidden until that frame has painted.
    pub fn prepare(&mut self, ctx: &egui::Context) {
        self.sync_system_palette(ctx);
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

        ctx.add_plugin(CopyOnSelect::default());
        ctx.all_styles_mut(|style| style.interaction.selectable_labels = false);
        install_fonts(ctx);
        self.apply_visuals(ctx);
    }

    /// The OS can change while the app runs. System follows it live; a manual
    /// choice never does.
    fn sync_system_palette(&mut self, ctx: &egui::Context) {
        if self.settings.theme != Theme::System {
            return;
        }
        let palette = Theme::System.palette(system_is_dark(ctx));
        if palette != self.palette {
            self.set_palette(ctx, palette);
        }
    }

    fn set_palette(&mut self, ctx: &egui::Context, palette: Palette) {
        self.palette = palette;
        self.editor = None;
        self.editor_sessions.clear();
        self.sync_editor_resources();
        if self.style_applied {
            self.apply_visuals(ctx);
        }
        ctx.request_repaint();
    }

    fn apply_visuals(&self, ctx: &egui::Context) {
        let palette = self.palette;
        let preference = if self.settings.theme == Theme::System {
            egui::ThemePreference::System
        } else if palette.is_dark() {
            egui::ThemePreference::Dark
        } else {
            egui::ThemePreference::Light
        };
        ctx.set_theme(preference);

        let mut visuals = if palette.is_dark() {
            egui::Visuals::dark()
        } else {
            egui::Visuals::light()
        };
        visuals.panel_fill = palette.bg;
        visuals.window_fill = palette.surface;
        visuals.extreme_bg_color = palette.code_bg;
        visuals.text_edit_bg_color = Some(palette.surface);
        visuals.faint_bg_color = palette.surface;
        visuals.code_bg_color = palette.code_bg;
        visuals.override_text_color = Some(palette.ink);
        visuals.weak_text_color = Some(palette.muted);
        visuals.hyperlink_color = palette.link;
        visuals.window_stroke = Stroke::new(1.0, palette.border);
        visuals.widgets.noninteractive.bg_fill = palette.bg;
        visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, palette.border);
        visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, palette.ink);
        visuals.widgets.inactive.bg_fill = palette.surface;
        visuals.widgets.inactive.weak_bg_fill = palette.surface;
        visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, palette.border);
        visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, palette.ink);
        visuals.widgets.hovered.bg_fill = palette.selection;
        visuals.widgets.hovered.weak_bg_fill = palette.selection;
        visuals.widgets.hovered.bg_stroke = Stroke::new(2.0, palette.focus);
        visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, palette.ink);
        visuals.widgets.active.bg_fill = palette.selection;
        visuals.widgets.active.weak_bg_fill = palette.selection;
        visuals.widgets.active.bg_stroke = Stroke::new(2.0, palette.focus);
        visuals.widgets.active.fg_stroke = Stroke::new(1.0, palette.ink);
        visuals.widgets.open = visuals.widgets.active;
        visuals.selection.bg_fill = palette.selection;
        visuals.selection.stroke = Stroke::new(2.0, palette.focus);
        visuals.text_cursor.stroke = Stroke::new(2.0, palette.focus);
        ctx.set_visuals(visuals);
        ctx.all_styles_mut(|style| style.interaction.selectable_labels = false);
    }

    fn choose_theme(&mut self, ctx: &egui::Context, theme: Theme) {
        if self.settings.theme == theme {
            return;
        }
        self.settings.theme = theme;
        let palette = theme.palette(system_is_dark(ctx));
        self.set_palette(ctx, palette);
        self.persist_settings();
        ctx.request_repaint();
    }

    fn choose_font(&mut self, ctx: &egui::Context, font: FontChoice) {
        if self.settings.font == font {
            return;
        }
        self.settings.font = font;
        self.refresh_content_resources();
        self.persist_settings();
        ctx.request_repaint();
    }

    fn choose_text_size(&mut self, ctx: &egui::Context, text_size: TextSize) {
        if self.settings.text_size == text_size {
            return;
        }
        self.settings.text_size = text_size;
        self.refresh_content_resources();
        self.persist_settings();
        ctx.request_repaint();
    }

    /// Editor resources bake the font and palette into cached galleys; drop
    /// them and rebuild for the active document. Preview styling is applied
    /// each frame, so it needs no rebuild.
    fn refresh_content_resources(&mut self) {
        self.editor = None;
        self.editor_sessions.clear();
        self.sync_editor_resources();
    }

    fn persist_settings(&mut self) {
        let result = self
            .settings_path
            .as_deref()
            .map(|path| self.settings.save(path));
        if let Some(Err(error)) = result {
            self.show_message(error);
        }
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
                    self.editor = Some(EditorResources::new(
                        self.palette,
                        self.settings.font.editor_family(),
                        self.settings.text_size.editor_size(),
                    ));
                }
                self.editor_sessions.entry(document_id).or_default();
            }
            Mode::Preview => {
                let key = (document_id, revision, scope.clone());
                if self.preview_revision != Some(key.clone()) {
                    let prepared = preview::prepare_with_images(
                        &content,
                        scope.as_deref(),
                        self.images.as_ref(),
                    );
                    self.sections.prune(document_id, prepared.sections.keys());
                    self.preview = Some(prepared);
                    self.preview_revision = Some(key);
                }
            }
        }
    }

    fn dispatch(&mut self, ctx: &egui::Context, commands: Vec<Command>) {
        let focus_after = !self.tab_keyboard
            && commands.iter().any(|command| {
                matches!(
                    command,
                    Command::NewUntitled
                        | Command::ActivateTab(_)
                        | Command::SetMode(Mode::Edit)
                        | Command::ToggleMode
                        | Command::CycleTab(_)
                        | Command::CloseTab(_)
                        | Command::GuardChosen(_)
                        | Command::ExternalChosen { .. }
                )
            });
        self.tab_keyboard = false;
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
                    crate::domain::Effect::ShowExportDialog { suggested_name } => {
                        pending.push_back(match self.dialogs.export_html(&suggested_name) {
                            Some(path) => Command::ExportPathChosen(self.files.canonicalize(&path)),
                            None => Command::ExportCancelled,
                        });
                    }
                    crate::domain::Effect::WriteExportFile { document_id, path } => {
                        let name = display_name(&path);
                        match self.write_export(document_id, &path, ctx) {
                            Ok(()) => self.show_message(format!("Exported {name}")),
                            Err(message) => {
                                self.show_message(format!("Could not export {name}: {message}"))
                            }
                        }
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
            let edit = self
                .workspace
                .active_document()
                .is_some_and(|document| document.mode == Mode::Edit);
            self.focus_editor = edit;
            self.focus_preview = !edit && self.workspace.active_document().is_some();
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
        let workspace = &self.workspace;
        self.sections
            .retain_documents(|document_id| workspace.document(document_id).is_some());
        self.sync_editor_resources();
    }

    fn show_message(&mut self, message: impl Into<String>) {
        self.show_toast_for(message, Duration::from_secs(6));
    }

    fn show_copy_toast(&mut self) {
        self.show_toast_for("Copied", Duration::from_millis(1_500));
    }

    fn show_toast_for(&mut self, message: impl Into<String>, duration: Duration) {
        self.toast = Some(Toast {
            message: message.into(),
            expires_at: Instant::now() + duration,
        });
    }

    /// Takes the selection captured after last frame's mouse release. Also
    /// disarms capture until Preview re-enables it for this frame.
    fn take_settled_selection(&mut self, ctx: &egui::Context) -> Option<String> {
        let handle = ctx.plugin::<CopyOnSelect>();
        let mut plugin = handle.lock();
        plugin.enabled = false;
        plugin.settled.take()
    }

    fn handle_selection_settled(&mut self, ctx: &egui::Context, text: &str) {
        if text.is_empty()
            || self
                .workspace
                .active_document()
                .is_none_or(|document| document.mode != Mode::Preview)
        {
            return;
        }
        if self.copy_to_clipboard(text) {
            ctx.plugin::<egui::text_selection::LabelSelectionState>()
                .lock()
                .clear_selection();
        }
    }

    fn copy_to_clipboard(&mut self, text: &str) -> bool {
        if self.clipboard.set_text(text).is_ok() {
            self.show_copy_toast();
            true
        } else {
            self.show_message("Could not copy");
            false
        }
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
            self.open_about();
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
            || self.workspace.export_dialog_open()
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

    fn write_export(
        &self,
        document_id: DocumentId,
        path: &Path,
        ctx: &egui::Context,
    ) -> Result<(), String> {
        let Some(document) = self.workspace.document(document_id) else {
            return Err("the Document is closed".to_owned());
        };
        let title = document.file_name();
        let options = ExportOptions {
            title: &title,
            palette: self.palette,
            font: self.settings.font,
            text_size: self.settings.text_size,
            scope: document.image_scope(),
            images: self.images.as_ref(),
            ctx,
        };
        let html = export::document(&document.content, &options);
        self.files
            .write_utf8(path, &html)
            .map_err(|error| error.to_string())
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

    fn show_tab_bar(&mut self, ui: &mut Ui) -> Vec<Command> {
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
        let mut focused_tab = None;
        let mut tab_ids = vec![None; tabs.len()];
        Panel::top("tab_bar")
            .frame(
                Frame::new()
                    .fill(self.palette.surface)
                    .stroke(Stroke::new(1.0, self.palette.border))
                    .inner_margin(Margin::symmetric(12, 6)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.ctx().accesskit_node_builder(ui.unique_id(), |node| {
                        node.set_role(Role::TabList);
                        node.set_label("Open documents");
                    });
                    let mut rects = Vec::new();
                    let mut dragged = None;
                    for (index, (id, label, is_active)) in tabs.iter().enumerate() {
                        ui.horizontal(|ui| {
                            let name = tab_accessible_name(label);
                            let response = ui.add(
                                egui::Button::new(
                                    RichText::new(label).monospace().color(self.palette.ink),
                                )
                                .frame(false)
                                .sense(Sense::click_and_drag()),
                            );
                            response.widget_info(|| WidgetInfo::labeled(Role::Tab, true, &name));
                            ui.ctx().accesskit_node_builder(response.id, |node| {
                                node.set_selected(*is_active);
                            });
                            if self.pending_tab_focus == Some(response.id) {
                                response.request_focus();
                                self.pending_tab_focus = None;
                            }
                            if response.has_focus() {
                                focused_tab = Some(index);
                            }
                            tab_ids[index] = Some(response.id);
                            paint_focus_ring(ui, &response, self.palette);
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
                            let close_name = format!("Close {}", tab_title(label));
                            close.widget_info(|| {
                                WidgetInfo::labeled(Role::Button, true, &close_name)
                            });
                            paint_focus_ring(ui, &close, self.palette);
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

        if let Some(index) = focused_tab {
            let delta = ui.input_mut(|input| {
                if input.consume_key(Modifiers::NONE, Key::ArrowRight) {
                    1
                } else if input.consume_key(Modifiers::NONE, Key::ArrowLeft) {
                    -1
                } else {
                    0
                }
            });
            if delta != 0 && !tabs.is_empty() {
                let next = (index as isize + delta).rem_euclid(tabs.len() as isize) as usize;
                self.tab_keyboard = true;
                self.pending_tab_focus = tab_ids[next];
                commands.push(Command::ActivateTab(tabs[next].0));
            }
        }
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
                    if mode_toggle(ui, self.palette, "Preview", mode == Mode::Preview) {
                        commands.push(Command::SetMode(Mode::Preview));
                    }
                    if mode_toggle(ui, self.palette, "Edit", mode == Mode::Edit) {
                        commands.push(Command::SetMode(Mode::Edit));
                    }
                    ui.separator();
                    let ctx = ui.ctx().clone();
                    ui.menu_button("Appearance", |ui| {
                        ui.menu_button("Theme", |ui| {
                            for theme in Theme::ALL {
                                if ui
                                    .selectable_label(self.settings.theme == theme, theme.label())
                                    .clicked()
                                {
                                    self.choose_theme(&ctx, theme);
                                    ui.close();
                                }
                            }
                        });
                        ui.menu_button("Font", |ui| {
                            for font in FontChoice::ALL {
                                if ui
                                    .selectable_label(self.settings.font == font, font.label())
                                    .clicked()
                                {
                                    self.choose_font(&ctx, font);
                                    ui.close();
                                }
                            }
                        });
                        ui.menu_button("Text Size", |ui| {
                            for size in TextSize::ALL {
                                if ui
                                    .selectable_label(self.settings.text_size == size, size.label())
                                    .clicked()
                                {
                                    self.choose_text_size(&ctx, size);
                                    ui.close();
                                }
                            }
                        });
                    });
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
                            self.open_about();
                        }
                        if ui.button("Save As").clicked() {
                            commands.push(Command::SaveAs);
                        }
                        if ui.button("Export HTML").clicked() {
                            commands.push(Command::ExportHtml);
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
        let content_font = self.settings.font;
        let content_size = self.settings.text_size;
        let first_frame = self.frame_count == 0;
        let preview = self.preview.as_ref();
        let document_id = self.workspace.active_document().map(|document| document.id);
        let collapsed = document_id.map(|document_id| self.sections.collapsed_mut(document_id));
        let cache = &mut self.cache;
        let copy_request = Rc::new(RefCell::new(None));

        Frame::new()
            .fill(palette.bg)
            .inner_margin(Margin::symmetric(28, 20))
            .show(ui, |ui| {
                if let (Some(preview), Some(document_id), Some(collapsed)) =
                    (preview, document_id, collapsed)
                {
                    ScrollArea::vertical()
                        .id_salt(preview_scroll_id(document_id))
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.style_mut().interaction.selectable_labels = true;
                            apply_preview_text_style(ui, content_font, content_size);
                            ui.ctx().plugin::<CopyOnSelect>().lock().enabled = true;
                            // A focus stop before the content so Tab reaches the
                            // Preview before its headings and links.
                            let region = ui.interact(
                                ui.max_rect(),
                                preview_region_id(document_id),
                                Sense::click(),
                            );
                            region.widget_info(|| {
                                WidgetInfo::labeled(Role::Region, true, "Preview content")
                            });
                            if self.focus_preview {
                                region.request_focus();
                                self.focus_preview = false;
                            }
                            paint_focus_ring(ui, &region, palette);
                            let (markdown, sections) = if first_frame {
                                (
                                    preview
                                        .first_frame_render_markdown
                                        .as_deref()
                                        .unwrap_or(&preview.render_markdown),
                                    preview
                                        .first_frame_sections
                                        .as_ref()
                                        .unwrap_or(&preview.sections),
                                )
                            } else {
                                (preview.render_markdown.as_str(), &preview.sections)
                            };
                            show_sectioned_markdown(
                                ui,
                                markdown,
                                sections,
                                preview.code_blocks.clone(),
                                palette,
                                cache,
                                collapsed,
                                &copy_request,
                            );
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

        let text = copy_request.borrow_mut().take();
        if let Some(text) = text {
            self.copy_to_clipboard(&text);
        }
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

    fn open_about(&mut self) {
        if self.about_open {
            return;
        }
        self.about_open = true;
        self.focus_about = true;
    }

    fn close_about(&mut self) {
        self.about_open = false;
        let edit = self
            .workspace
            .active_document()
            .is_some_and(|document| document.mode == Mode::Edit);
        self.focus_editor = edit;
        self.focus_preview = !edit && self.workspace.active_document().is_some();
    }

    fn show_about(&mut self, ctx: &egui::Context) {
        if !self.about_open {
            return;
        }

        let mut close = false;
        let mut open_repository = false;
        let modal = Modal::new(Id::unique("about")).show(ctx, |ui| {
            ui.ctx().accesskit_node_builder(ui.unique_id(), |node| {
                node.set_role(Role::Dialog);
                node.set_label("About Markdown Hexer");
                node.set_description(format!(
                    "Version {}. Keyboard shortcuts and repository link.",
                    env!("CARGO_PKG_VERSION")
                ));
            });
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
            let close_button = ui.add(egui::Button::new("Close"));
            if self.focus_about {
                close_button.request_focus();
                self.focus_about = false;
            }
            paint_focus_ring(ui, &close_button, self.palette);
            if close_button.clicked() {
                close = true;
            }
        });

        if modal.should_close() {
            close = true;
        }
        if open_repository && !crate::platform::open_url(REPOSITORY) {
            self.show_message("Could not open the repository link");
        }
        if close {
            self.close_about();
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
                    .fill(palette.toast_bg)
                    .stroke(Stroke::new(1.0, palette.border))
                    .inner_margin(Margin::symmetric(16, 10))
                    .show(ui, |ui| {
                        ui.set_max_width(560.0);
                        let label = ui.add(
                            Label::new(RichText::new(&toast.message).color(palette.toast_ink))
                                .wrap(),
                        );
                        label.widget_info(|| {
                            WidgetInfo::labeled(Role::Status, true, &toast.message)
                        });
                        ui.ctx().accesskit_node_builder(label.id, |node| {
                            node.set_live(egui::accesskit::Live::Polite);
                            node.set_live_atomic();
                        });
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
        self.sync_system_palette(&ctx);
        if let Some(text) = self.take_settled_selection(&ctx) {
            self.handle_selection_settled(&ctx, &text);
        }
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
                Command::Save
                    | Command::SaveAs
                    | Command::ExportHtml
                    | Command::CloseTab(_)
                    | Command::GuardChosen(_)
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

#[derive(Clone, Copy)]
struct SectionSource<'a> {
    markdown: &'a str,
    definitions: &'a str,
}

#[allow(clippy::too_many_arguments)]
fn show_sectioned_markdown(
    ui: &mut Ui,
    source: &str,
    sections: &Sections,
    code_blocks: Vec<FencedCode>,
    palette: Palette,
    cache: &mut egui_commonmark::CommonMarkCache,
    collapsed: &mut HashSet<String>,
    copy_request: &Rc<RefCell<Option<String>>>,
) {
    let copy_request = Rc::clone(copy_request);
    let render_code = move |ui: &mut Ui, html: &str| {
        if let Some(index) = code_sentinel_index(html)
            && let Some(code) = code_blocks.get(index)
        {
            show_code_block(ui, &palette, code, index, &copy_request);
        }
    };

    if sections.roots.is_empty() {
        show_markdown_segment(ui, source, cache, &render_code, "");
        return;
    }

    let preamble = &source[sections.preamble.clone()];
    if !preamble.trim().is_empty() {
        show_markdown_segment(
            ui,
            preamble,
            cache,
            &render_code,
            &sections.link_definitions,
        );
    }
    for section in &sections.roots {
        show_section(
            ui,
            SectionSource {
                markdown: source,
                definitions: &sections.link_definitions,
            },
            section,
            cache,
            collapsed,
            &palette,
            &render_code,
        );
    }
}

fn show_section(
    ui: &mut Ui,
    source: SectionSource<'_>,
    section: &Section,
    cache: &mut egui_commonmark::CommonMarkCache,
    collapsed: &mut HashSet<String>,
    palette: &Palette,
    render_code: &egui_commonmark::RenderHtmlFn,
) {
    ui.push_id(("preview_section", &section.key), |ui| {
        ui.add_space(6.0);
        let is_collapsed = collapsed.contains(&section.key);
        ui.horizontal(|ui| {
            let has_chevron = section.has_chevron(source.markdown);
            let mut toggle = false;
            if has_chevron {
                let (symbol, label) = if is_collapsed {
                    (">", "Expand section")
                } else {
                    ("v", "Collapse section")
                };
                let response = ui.add(
                    egui::Button::new(
                        RichText::new(symbol)
                            .monospace()
                            .size(14.0)
                            .color(palette.muted),
                    )
                    .frame(false)
                    .min_size(egui::vec2(16.0, 16.0)),
                );
                response.widget_info(|| WidgetInfo::labeled(Role::Button, true, label));
                paint_focus_ring(ui, &response, *palette);
                if response.clicked() {
                    toggle = true;
                }
            } else {
                ui.add_space(16.0);
            }
            let heading = ui.add(
                Label::new(section_heading_text(ui, section.level, &section.title))
                    .selectable(true)
                    .sense(Sense::click_and_drag()),
            );
            heading.widget_info(|| WidgetInfo::labeled(Role::Heading, true, section.title.clone()));
            ui.ctx().accesskit_node_builder(heading.id, |node| {
                node.set_level(usize::from(section.level));
                if has_chevron {
                    node.set_expanded(!is_collapsed);
                }
            });
            paint_focus_ring(ui, &heading, *palette);
            if heading.clicked() {
                toggle = true;
            }
            if toggle && has_chevron {
                if is_collapsed {
                    collapsed.remove(&section.key);
                } else {
                    collapsed.insert(section.key.clone());
                }
            }
        });

        if is_collapsed {
            return;
        }
        let body = &source.markdown[section.body.clone()];
        if !body.trim().is_empty() {
            ui.add_space(2.0);
            show_markdown_segment(ui, body, cache, render_code, source.definitions);
        }
        for child in &section.children {
            show_section(ui, source, child, cache, collapsed, palette, render_code);
        }
    });
}

fn show_markdown_segment(
    ui: &mut Ui,
    markdown: &str,
    cache: &mut egui_commonmark::CommonMarkCache,
    render_code: &egui_commonmark::RenderHtmlFn,
    definitions: &str,
) {
    if definitions.is_empty() {
        CommonMarkViewer::new()
            .render_html_fn(Some(render_code))
            .show(ui, cache, markdown);
    } else {
        let markdown = format!("{markdown}\n\n{definitions}");
        CommonMarkViewer::new()
            .render_html_fn(Some(render_code))
            .show(ui, cache, &markdown);
    }
}

fn section_heading_text(ui: &Ui, level: u8, title: &str) -> RichText {
    let min = ui
        .style()
        .text_styles
        .get(&egui::TextStyle::Body)
        .map_or(14.0, |font| font.size);
    let max = ui
        .style()
        .text_styles
        .get(&egui::TextStyle::Heading)
        .map_or(32.0, |font| font.size);
    let factor = match level {
        1 => 0.835,
        2 => 0.668,
        3 => 0.501,
        4 => 0.334,
        _ => 0.167,
    };
    let text = RichText::new(title).size(min + (max - min) * factor);
    if level <= 3 { text.strong() } else { text }
}

fn code_sentinel_index(html: &str) -> Option<usize> {
    html.trim()
        .strip_prefix("<div data-hexer-code=\"")?
        .strip_suffix("\"></div>")?
        .parse()
        .ok()
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
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
        &export::code_theme(style, palette),
        &code.text,
        code.language.as_deref().unwrap_or(""),
    )
}

fn show_code_block(
    ui: &mut Ui,
    palette: &Palette,
    code: &FencedCode,
    index: usize,
    copy_request: &RefCell<Option<String>>,
) -> (egui::Response, egui::Response) {
    let mut content = None;
    let frame = Frame::new()
        .fill(palette.code_bg)
        .stroke(Stroke::new(1.0, palette.border))
        .corner_radius(4)
        .inner_margin(Margin::symmetric(10, 8))
        .show(ui, |ui| {
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let copy = ui.add(
                    egui::Button::new(RichText::new("Copy").small().color(palette.muted))
                        .frame(false),
                );
                copy.widget_info(|| {
                    WidgetInfo::labeled(
                        Role::Button,
                        true,
                        format!("Copy code block {}", index + 1),
                    )
                });
                paint_focus_ring(ui, &copy, *palette);
                if copy.clicked() {
                    *copy_request.borrow_mut() = Some(code.copy_text());
                }
            });
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
