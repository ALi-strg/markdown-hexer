#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::time::Instant;

use markdown_hexer::platform::NativeFileSystem;
use markdown_hexer::startup;
use markdown_hexer::ui::HexerApp;

fn main() -> eframe::Result {
    let t_main = Instant::now();
    let path = std::env::args_os().nth(1).map(PathBuf::from);
    let startup = startup::launch(path, &NativeFileSystem);

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
        Box::new(move |_cc| Ok(Box::new(HexerApp::new(startup, t_main)))),
    )
}
