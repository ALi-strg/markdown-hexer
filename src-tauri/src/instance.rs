use std::path::Path;
use std::sync::Mutex;

/// Holds a file path that should be opened once the frontend is ready.
///
/// Set at startup when the app is launched with a file argument, and whenever
/// the single-instance plugin reports a second launch that forwards a path. The
/// frontend pulls it with the `get_pending_file` command and runs the Open flow.
pub struct PendingFile(Mutex<Option<String>>);

impl PendingFile {
    /// Captures the file argument from the current process's launch arguments,
    /// if any (a `.md` file double-clicked in the OS file manager).
    pub fn from_startup_args() -> Self {
        let argv: Vec<String> = std::env::args().collect();
        PendingFile(Mutex::new(extract_file_path(&argv)))
    }

    /// Stores a path forwarded by a second launch of the app.
    pub fn set(&self, path: String) {
        *self.0.lock().unwrap() = Some(path);
    }

    /// Returns and clears the pending path, so a forwarded file opens once.
    pub fn take(&self) -> Option<String> {
        self.0.lock().unwrap().take()
    }
}

/// Extracts the file path from a process's launch arguments.
///
/// The first argument is the app binary; the first later argument that exists
/// as a file on disk is the file the OS asked us to open. Flags like `--help`
/// are skipped because they are not files.
pub fn extract_file_path(argv: &[String]) -> Option<String> {
    argv.iter()
        .skip(1)
        .find(|arg| Path::new(arg).is_file())
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "alimd-instance-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn extracts_an_existing_file_from_launch_arguments() {
        let dir = temp_dir("existing");
        let path = dir.join("note.md");
        fs::write(&path, "# Hello").expect("write fixture");
        let argv = vec![
            "app.exe".to_string(),
            path.to_str().unwrap().to_string(),
        ];

        assert_eq!(extract_file_path(&argv), Some(path.to_str().unwrap().to_string()));

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn returns_none_when_only_the_binary_is_passed() {
        let argv = vec!["app.exe".to_string()];
        assert_eq!(extract_file_path(&argv), None);
    }

    #[test]
    fn returns_none_when_the_argument_is_not_a_file() {
        let argv = vec!["app.exe".to_string(), "--version".to_string()];
        assert_eq!(extract_file_path(&argv), None);
    }

    #[test]
    fn returns_none_when_the_file_does_not_exist() {
        let argv = vec!["app.exe".to_string(), "C:\\missing\\note.md".to_string()];
        assert_eq!(extract_file_path(&argv), None);
    }

    #[test]
    fn take_returns_and_clears_the_pending_path() {
        let pending = PendingFile(Mutex::new(Some("C:\\notes\\a.md".to_string())));

        assert_eq!(pending.take(), Some("C:\\notes\\a.md".to_string()));
        assert_eq!(pending.take(), None);
    }

    #[test]
    fn set_stores_a_forwarded_path() {
        let pending = PendingFile(Mutex::new(None));
        pending.set("C:\\notes\\b.md".to_string());

        assert_eq!(pending.take(), Some("C:\\notes\\b.md".to_string()));
    }
}
