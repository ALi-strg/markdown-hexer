#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Instant;

use markdown_hexer::platform::NativeFileSystem;
use markdown_hexer::platform::instance::{self, Acquire};
use markdown_hexer::settings::{self, Settings};
use markdown_hexer::startup;
use markdown_hexer::ui::HexerApp;

fn main() -> eframe::Result {
    let t_main = Instant::now();
    let paths = startup::paths_from_args(std::env::args_os().skip(1));
    let server = match instance::acquire(paths.clone()) {
        Acquire::Forwarded => return Ok(()),
        Acquire::Primary { server, warning } => {
            if let Some(warning) = warning {
                eprintln!("markdown-hexer: {warning}");
            }
            server
        }
    };

    let startup = startup::launch(paths, &NativeFileSystem);

    // Read settings before the window exists so the first painted frame already
    // has the right palette, text size, and font.
    let settings_path = settings::default_path();
    let settings = settings_path
        .as_deref()
        .map(Settings::load)
        .unwrap_or_default();

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title(startup.workspace.window_title())
            .with_inner_size([1080.0, 760.0])
            .with_min_inner_size([640.0, 420.0])
            // eframe also starts hidden until the first frame is painted.
            .with_visible(false),
        renderer: eframe::Renderer::Glow,
        multisampling: 0,
        ..Default::default()
    };

    eframe::run_native(
        "Markdown Hexer",
        options,
        Box::new(move |cc| {
            let mut app = HexerApp::new(startup, t_main).with_settings(settings, settings_path);
            app.prepare(&cc.egui_ctx);
            app.attach_instance(server);
            Ok(Box::new(app))
        }),
    )
}
