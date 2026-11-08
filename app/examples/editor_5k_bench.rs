//! Drive the real editor for ten seconds with typing, selection, and scrolling.
//!
//! Set `HEXER_EDITOR_BENCH_LOG` to a CSV path. `tools/editor_bench.py` runs
//! this example and reports the frame budget.

use std::io::Write as _;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use egui::{Event, Key, Modifiers, MouseWheelSource, MouseWheelUnit, TouchPhase, pos2, vec2};
use markdown_hexer::startup;
use markdown_hexer::ui::HexerApp;

// One second of pinning down the first shaping pass, then four seconds of
// typing. The cold first edit is measured separately by the First Edit gate;
// the longer warm-up also keeps one-off process startup and virus-scanner work
// out of the steady-state window.
const WARMUP: Duration = Duration::from_secs(5);
const MEASURE: Duration = Duration::from_secs(10);

struct BenchApp {
    app: HexerApp,
    started: Instant,
    hooks: u8,
    pointer_sent: bool,
    samples: Vec<(f32, f32, &'static str)>,
    dir: f32,
    last_scroll_second: u64,
    finished: bool,
}

impl BenchApp {
    fn new(app: HexerApp) -> Self {
        Self {
            app,
            started: Instant::now(),
            hooks: 0,
            pointer_sent: false,
            samples: Vec::new(),
            dir: -1.0,
            last_scroll_second: 0,
            finished: false,
        }
    }

    fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }
}

impl eframe::App for BenchApp {
    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        self.app.ui(ui, frame);

        let elapsed = self.elapsed();
        if elapsed >= WARMUP
            && elapsed < WARMUP + MEASURE
            && let Some(cpu) = frame.info().cpu_usage
        {
            let seconds = (elapsed - WARMUP).as_secs_f32();
            let phase = if seconds < 3.0 {
                "type"
            } else if seconds < 6.0 {
                "select"
            } else {
                "scroll"
            };
            self.samples.push((seconds, cpu * 1000.0, phase));
        }

        if elapsed >= WARMUP + MEASURE && !self.finished {
            self.finished = true;
            if let Ok(path) = std::env::var("HEXER_EDITOR_BENCH_LOG") {
                let mut file = std::fs::File::create(path).expect("bench log");
                writeln!(file, "seconds,cpu_ms,phase").unwrap();
                for (seconds, cpu, phase) in &self.samples {
                    writeln!(file, "{seconds:.3},{cpu:.3},{phase}").unwrap();
                }
            }
            std::process::exit(0);
        }
        ui.ctx().request_repaint();
    }

    fn raw_input_hook(&mut self, _ctx: &egui::Context, raw_input: &mut egui::RawInput) {
        if self.hooks < 2 {
            let key = if self.hooks == 0 { Key::E } else { Key::End };
            self.hooks += 1;
            raw_input.events.push(Event::Key {
                key,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers: Modifiers::COMMAND,
            });
            raw_input.events.push(Event::Key {
                key,
                physical_key: None,
                pressed: false,
                repeat: false,
                modifiers: Modifiers::NONE,
            });
            return;
        }

        let elapsed = self.elapsed();
        if elapsed < WARMUP {
            if elapsed >= Duration::from_secs(1) {
                raw_input.events.push(Event::Text("w".to_owned()));
            }
            return;
        }
        let seconds = (elapsed - WARMUP).as_secs_f64();
        if seconds < 3.0 {
            raw_input.events.push(Event::Text("a".to_owned()));
        } else if seconds < 6.0 {
            raw_input.events.push(Event::Key {
                key: Key::ArrowRight,
                physical_key: None,
                pressed: true,
                repeat: false,
                modifiers: Modifiers::SHIFT,
            });
        } else {
            if !self.pointer_sent {
                self.pointer_sent = true;
                raw_input
                    .events
                    .push(Event::PointerMoved(pos2(500.0, 300.0)));
            }
            let second = elapsed.as_secs();
            if second != self.last_scroll_second {
                self.last_scroll_second = second;
                self.dir = -self.dir;
            }
            raw_input.events.push(Event::MouseWheel {
                unit: MouseWheelUnit::Point,
                delta: vec2(0.0, 240.0 * self.dir),
                phase: TouchPhase::Move,
                source: MouseWheelSource::Wheel,
                modifiers: Modifiers::NONE,
            });
        }
    }
}

fn main() -> eframe::Result {
    let paths = std::env::args_os().skip(1).map(PathBuf::from).collect();
    let startup = startup::launch(paths, &markdown_hexer::platform::NativeFileSystem);
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Markdown Hexer editor bench")
            .with_inner_size([1080.0, 760.0])
            .with_visible(true),
        renderer: eframe::Renderer::Glow,
        multisampling: 0,
        ..Default::default()
    };
    eframe::run_native(
        "Markdown Hexer editor bench",
        options,
        Box::new(move |_cc| {
            Ok(Box::new(BenchApp::new(HexerApp::new(
                startup,
                Instant::now(),
            ))))
        }),
    )
}
