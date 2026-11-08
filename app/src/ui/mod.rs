mod palette;

pub use palette::Palette;

use std::time::{Duration, Instant};

use egui::{
    Align2, CentralPanel, Frame, Label, Margin, Panel, RichText, ScrollArea, Stroke,
    ViewportCommand,
};
use egui_commonmark::CommonMarkViewer;

use crate::preview::{self, PreparedPreview};
use crate::startup::{Startup, StartupTimer};

pub struct HexerApp {
    workspace: crate::domain::Workspace,
    preview: Option<PreparedPreview>,
    cache: egui_commonmark::CommonMarkCache,
    palette: Palette,
    toast: Option<Toast>,
    style_applied: bool,
    title_sent: Option<String>,
    frame_count: u64,
    timer: StartupTimer,
}

struct Toast {
    message: String,
    expires_at: Instant,
}

impl HexerApp {
    pub fn new(startup: Startup, t_main: Instant) -> Self {
        let preview = startup
            .workspace
            .active_document()
            .map(|document| preview::prepare(&document.content));

        Self {
            workspace: startup.workspace,
            preview,
            cache: egui_commonmark::CommonMarkCache::default(),
            palette: Palette::default_light(),
            toast: startup.notice.map(|message| Toast {
                message,
                expires_at: Instant::now() + Duration::from_secs(6),
            }),
            style_applied: false,
            title_sent: None,
            frame_count: 0,
            timer: StartupTimer::new(t_main),
        }
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

    fn show_tab_bar(&self, ui: &mut egui::Ui) {
        let Some(tab) = self.workspace.active_tab() else {
            return;
        };

        Panel::top("tab_bar")
            .frame(
                Frame::new()
                    .fill(self.palette.surface)
                    .stroke(Stroke::new(1.0, self.palette.border))
                    .inner_margin(Margin::symmetric(12, 6)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let response = ui.add(
                        Label::new(
                            RichText::new(tab.title())
                                .monospace()
                                .color(self.palette.ink),
                        )
                        .selectable(false),
                    );
                    ui.painter().hline(
                        response.rect.x_range(),
                        response.rect.bottom() + 2.0,
                        Stroke::new(1.0, self.palette.accent),
                    );
                });
            });
    }

    fn show_preview(&mut self, root: &mut egui::Ui) {
        let palette = self.palette;
        let preview = self.preview.as_ref();
        let cache = &mut self.cache;

        CentralPanel::default()
            .frame(
                Frame::new()
                    .fill(palette.bg)
                    .inner_margin(Margin::symmetric(28, 20)),
            )
            .show(root, |ui| {
                if let Some(preview) = preview {
                    ScrollArea::vertical()
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

        egui::Area::new(egui::Id::unique("toast"))
            .anchor(Align2::CENTER_BOTTOM, egui::vec2(0.0, -24.0))
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                Frame::new()
                    .fill(self.palette.surface)
                    .stroke(Stroke::new(1.0, self.palette.border))
                    .inner_margin(Margin::symmetric(16, 10))
                    .show(ui, |ui| {
                        ui.set_max_width(560.0);
                        ui.add(
                            Label::new(RichText::new(&toast.message).color(self.palette.ink))
                                .wrap(),
                        );
                    });
            });

        let remaining = toast.expires_at.saturating_duration_since(Instant::now());
        ctx.request_repaint_after(remaining);
    }
}

impl eframe::App for HexerApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.apply_style(&ctx);
        self.sync_title(&ctx);

        self.show_tab_bar(ui);
        self.show_preview(ui);
        self.show_toast(&ctx);

        if self.frame_count == 0 {
            // eframe shows the window only after this frame has painted, so the
            // first submitted frame is also the first readable frame.
            self.timer.mark_visible();
            self.timer.mark_readable();
        }
        self.frame_count += 1;
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        self.palette.bg.to_normalized_gamma_f32()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Command, Workspace};
    use egui_kittest::Harness;
    use egui_kittest::kittest::Queryable;

    fn app_with_file() -> HexerApp {
        let mut workspace = Workspace::new();
        workspace.apply(Command::FileLoaded {
            path: std::path::PathBuf::from("notes.md"),
            content: "# Notes\n\nHello.".to_owned(),
        });
        HexerApp::new(
            Startup {
                workspace,
                notice: None,
            },
            Instant::now(),
        )
    }

    fn empty_app(notice: Option<String>) -> HexerApp {
        HexerApp::new(
            Startup {
                workspace: Workspace::new(),
                notice,
            },
            Instant::now(),
        )
    }

    #[test]
    fn shell_shows_the_filename_tab() {
        let harness = Harness::builder()
            .with_size(egui::vec2(900.0, 700.0))
            .build_eframe(|_cc| app_with_file());

        harness.get_by_label("notes.md");
    }

    #[test]
    fn bare_shell_shows_a_neutral_empty_state() {
        let harness = Harness::builder()
            .with_size(egui::vec2(900.0, 700.0))
            .build_eframe(|_cc| empty_app(None));

        harness.get_by_label("No document open");
    }

    #[test]
    fn shell_renders_the_error_toast() {
        let harness = Harness::builder()
            .with_size(egui::vec2(900.0, 700.0))
            .build_eframe(|_cc| {
                empty_app(Some("Could not open broken.md: not valid UTF-8".to_owned()))
            });

        harness.get_by_label_contains("not valid UTF-8");
    }
}
