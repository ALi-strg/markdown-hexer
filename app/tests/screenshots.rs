#![cfg(feature = "screenshots")]

use std::path::{Path, PathBuf};
use std::time::Instant;

use egui_kittest::Harness;
use markdown_hexer::platform::NativeFileSystem;
use markdown_hexer::settings::{Settings, TextSize, Theme};
use markdown_hexer::startup;
use markdown_hexer::ui::HexerApp;

const PALETTES: [Theme; 6] = [
    Theme::Light,
    Theme::House,
    Theme::Dark,
    Theme::HighContrast,
    Theme::Nord,
    Theme::TerminalGreen,
];

const TEXT_SIZES: [TextSize; 3] = [TextSize::Small, TextSize::Medium, TextSize::Large];

const WINDOW_SIZE: [f32; 2] = [1080.0, 760.0];

/// Render the Preview fixture in every Palette and Text Size.
///
/// Run from `app/`:
/// `cargo test --features screenshots --test screenshots -- --ignored --nocapture`
///
/// The images land in `.scratch/preview-polish/screenshots` unless
/// `PREVIEW_SCREENSHOT_DIR` points somewhere else.
#[test]
#[ignore = "renders Preview screenshots; needs a GPU"]
fn render_preview_screenshots() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/readme.md");
    let out = std::env::var_os("PREVIEW_SCREENSHOT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../.scratch/preview-polish/screenshots")
        });
    std::fs::create_dir_all(&out).expect("create the screenshot directory");

    for theme in PALETTES {
        for text_size in TEXT_SIZES {
            let startup = startup::launch(vec![fixture.clone()], &NativeFileSystem);
            let settings = Settings {
                theme,
                text_size,
                ..Settings::default()
            };
            let app = HexerApp::new(startup, Instant::now()).with_settings(settings, None);
            let mut harness = Harness::builder()
                .with_size(egui::vec2(WINDOW_SIZE[0], WINDOW_SIZE[1]))
                .build_eframe(|_cc| app);
            harness.run();
            let image = harness.render().expect("render the Preview");
            let path = out.join(format!("preview-{theme:?}-{text_size:?}.png").to_lowercase());
            image.save(&path).expect("write the screenshot");
            eprintln!("wrote {}", path.display());
        }
    }
}
