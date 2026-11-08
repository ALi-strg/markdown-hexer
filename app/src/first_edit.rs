use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Measures the first switch from Preview to Edit for a file launch.
///
/// Enabled by `HEXER_FIRST_EDIT_LOG=<path>`; the UI toggles exactly once on
/// the frame after the first painted frame and appends one row.
#[derive(Clone, Debug)]
pub struct FirstEditProbe {
    log_path: PathBuf,
    armed: bool,
}

impl FirstEditProbe {
    pub fn from_env() -> Option<Self> {
        let path = std::env::var_os("HEXER_FIRST_EDIT_LOG")?;
        Some(Self::with_log_path(PathBuf::from(path)))
    }

    pub fn with_log_path(log_path: PathBuf) -> Self {
        Self {
            log_path,
            armed: true,
        }
    }

    pub fn armed(&self) -> bool {
        self.armed
    }

    /// The probe triggers once per process.
    pub fn take_trigger(&mut self) -> bool {
        std::mem::replace(&mut self.armed, false)
    }

    pub fn record(&self, elapsed: Duration) -> std::io::Result<()> {
        append_row(&self.log_path, elapsed)
    }
}

fn append_row(path: &Path, elapsed: Duration) -> std::io::Result<()> {
    let empty = path.metadata().map(|meta| meta.len() == 0).unwrap_or(true);
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    if empty {
        writeln!(file, "first_edit_ms")?;
    }
    writeln!(file, "{:.3}", elapsed.as_secs_f64() * 1_000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_one_header_and_one_row_per_run() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("first-edit.csv");
        let probe = FirstEditProbe::with_log_path(path.clone());

        probe.record(Duration::from_millis(42)).unwrap();

        let rows = std::fs::read_to_string(path).unwrap();
        assert_eq!(rows, "first_edit_ms\n42.000\n");
    }

    #[test]
    fn triggers_only_once() {
        let mut probe = FirstEditProbe::with_log_path(PathBuf::from("unused.csv"));
        assert!(probe.take_trigger());
        assert!(!probe.take_trigger());
    }
}
