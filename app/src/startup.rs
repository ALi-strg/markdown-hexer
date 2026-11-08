use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::domain::{Command, Effect, Workspace};
use crate::platform::FileSystem;

#[derive(Clone, Debug)]
pub struct Startup {
    pub workspace: Workspace,
    pub notice: Option<String>,
}

/// Resolve a launch through the Workspace command/effect seam.
pub fn launch(path: Option<PathBuf>, fs: &dyn FileSystem) -> Startup {
    let mut workspace = Workspace::new();
    let mut notice = None;

    // A bare launch intentionally starts in Edit. A file launch replaces this
    // placeholder, so it never builds editor state before the first frame.
    let mut pending = workspace.apply(Command::NewUntitled);
    if let Some(path) = path {
        pending.extend(workspace.apply(Command::OpenPath(path)));
    }

    while let Some(effect) = pending.pop() {
        match effect {
            Effect::ReadFile(path) => {
                let effects = match fs.read_utf8(&path) {
                    Ok(content) => workspace.apply(Command::FileLoaded { path, content }),
                    Err(error) => workspace.apply(Command::FileLoadFailed { path, error }),
                };
                pending.extend(effects);
            }
            Effect::ShowToast(message) => notice = Some(message),
            Effect::SetWindowTitle(_) => {}
            Effect::WriteFile { .. }
            | Effect::ShowOpenDialog
            | Effect::ShowSaveDialog { .. }
            | Effect::CloseWindow => {}
        }
    }

    Startup { workspace, notice }
}

#[derive(Clone, Debug)]
pub struct StartupTimer {
    t_main: Instant,
    t1: Option<Duration>,
    t2: Option<Duration>,
    t1_unix_ms: Option<u128>,
    t2_unix_ms: Option<u128>,
    log_path: Option<PathBuf>,
    logged: bool,
}

impl StartupTimer {
    /// Enabled by `HEXER_STARTUP_LOG=<path>`; otherwise startup stays quiet.
    pub fn new(t_main: Instant) -> Self {
        Self::with_log_path(
            t_main,
            std::env::var_os("HEXER_STARTUP_LOG").map(PathBuf::from),
        )
    }

    pub fn with_log_path(t_main: Instant, log_path: Option<PathBuf>) -> Self {
        Self {
            t_main,
            t1: None,
            t2: None,
            t1_unix_ms: None,
            t2_unix_ms: None,
            log_path,
            logged: false,
        }
    }

    /// Called at the end of the first frame, before eframe paints and shows
    /// the hidden window. App-side proxy for the visible frame.
    pub fn mark_visible(&mut self) -> Duration {
        let elapsed = self.t_main.elapsed();
        self.t1 = Some(elapsed);
        self.t1_unix_ms = Some(unix_ms(SystemTime::now()));
        elapsed
    }

    /// Called after the first frame, with the document laid out, has been
    /// submitted. Writes one CSV row per launch when enabled.
    pub fn mark_readable(&mut self) -> Option<Duration> {
        if self.logged {
            return self.t2;
        }
        let t2 = self.t_main.elapsed();
        self.t2 = Some(t2);
        self.t2_unix_ms = Some(unix_ms(SystemTime::now()));
        self.logged = true;

        if let (Some(path), Some(t1)) = (&self.log_path, self.t1)
            && let Err(error) = append_row(
                path,
                t1,
                t2,
                self.t1_unix_ms.unwrap_or_default(),
                self.t2_unix_ms.unwrap_or_default(),
            )
        {
            eprintln!("markdown-hexer: startup log failed: {error}");
        }
        Some(t2)
    }
}

fn append_row(
    path: &Path,
    t1: Duration,
    t2: Duration,
    t1_unix_ms: u128,
    t2_unix_ms: u128,
) -> std::io::Result<()> {
    let empty = path.metadata().map(|meta| meta.len() == 0).unwrap_or(true);
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    if empty {
        writeln!(file, "t1_ms,t2_ms,t1_unix_ms,t2_unix_ms")?;
    }
    writeln!(
        file,
        "{:.3},{:.3},{t1_unix_ms},{t2_unix_ms}",
        t1.as_secs_f64() * 1_000.0,
        t2.as_secs_f64() * 1_000.0
    )
}

fn unix_ms(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Mode;
    use crate::platform::NativeFileSystem;

    #[test]
    fn file_launch_opens_a_preview_document() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.md");
        std::fs::write(&path, "# Notes\n\nHello.").unwrap();

        let startup = launch(Some(path.clone()), &NativeFileSystem);

        assert!(startup.notice.is_none());
        assert_eq!(startup.workspace.tabs().len(), 1);
        let document = startup.workspace.active_document().unwrap();
        assert_eq!(document.path.as_deref(), Some(path.as_path()));
        assert_eq!(document.content, "# Notes\n\nHello.");
        assert_eq!(document.mode, Mode::Preview);
        assert_eq!(
            startup.workspace.window_title(),
            "notes.md — Markdown Hexer"
        );
    }

    #[test]
    fn launch_strips_a_leading_bom() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bom.md");
        std::fs::write(&path, b"\xEF\xBB\xBF# BOM").unwrap();

        let startup = launch(Some(path), &NativeFileSystem);

        assert_eq!(
            startup.workspace.active_document().unwrap().content,
            "# BOM"
        );
    }

    #[test]
    fn bare_launch_creates_an_untitled_document_in_edit() {
        let startup = launch(None, &NativeFileSystem);

        let document = startup
            .workspace
            .active_document()
            .expect("untitled document");
        assert_eq!(document.path, None);
        assert_eq!(document.content, "");
        assert_eq!(document.mode, Mode::Edit);
        assert_eq!(
            startup.workspace.active_tab().unwrap().title(),
            "Untitled.md"
        );
        assert!(startup.notice.is_none());
    }

    #[test]
    fn missing_path_toasts_and_leaves_an_untitled_document() {
        let dir = tempfile::tempdir().unwrap();
        let startup = launch(Some(dir.path().join("missing.md")), &NativeFileSystem);

        let document = startup.workspace.active_document().unwrap();
        assert_eq!(document.path, None);
        assert_eq!(document.mode, Mode::Edit);
        assert_eq!(startup.workspace.tabs().len(), 1);
        let notice = startup.notice.unwrap();
        assert!(notice.contains("missing.md"));
        assert!(notice.contains("file not found"));
    }

    #[test]
    fn non_utf8_path_toasts_and_leaves_an_untitled_document() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("binary.md");
        std::fs::write(&path, [0xFF, 0xFE, 0x00]).unwrap();

        let startup = launch(Some(path), &NativeFileSystem);

        let document = startup.workspace.active_document().unwrap();
        assert_eq!(document.path, None);
        assert_eq!(document.mode, Mode::Edit);
        assert!(startup.notice.unwrap().contains("not valid UTF-8"));
    }

    #[test]
    fn timer_writes_one_csv_row_per_launch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("startup.csv");
        let mut timer = StartupTimer::with_log_path(Instant::now(), Some(path.clone()));

        timer.mark_visible();
        timer.mark_readable();
        timer.mark_readable();

        let rows = std::fs::read_to_string(path).unwrap();
        assert_eq!(rows.lines().count(), 2);
        assert!(rows.starts_with("t1_ms,t2_ms,t1_unix_ms,t2_unix_ms\n"));
    }
}
