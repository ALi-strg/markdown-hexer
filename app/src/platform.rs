use std::fmt;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

pub mod instance;

/// Open an external http, https, or mailto link with the OS handler.
///
/// Returns false for every other scheme, so callers cannot navigate to local
/// files or hand arbitrary text to a shell.
pub fn open_url(url: &str) -> bool {
    if !is_allowed_url(url) {
        return false;
    }
    open_native(url).is_ok()
}

pub(crate) fn is_allowed_url(url: &str) -> bool {
    let Some((scheme, rest)) = url.split_once(':') else {
        return false;
    };
    if url.chars().any(|ch| ch.is_control() || ch.is_whitespace()) {
        return false;
    }
    match scheme.to_ascii_lowercase().as_str() {
        "http" | "https" => rest.starts_with("//") && rest.len() > 2,
        "mailto" => !rest.is_empty(),
        _ => false,
    }
}

fn open_native(url: &str) -> std::io::Result<()> {
    let mut command = if cfg!(windows) {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else {
        std::process::Command::new("xdg-open")
    };
    command.arg(url).spawn().map(|_| ())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReadError {
    NotFound,
    NotUtf8,
    Io(String),
}

impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(f, "file not found"),
            Self::NotUtf8 => write!(f, "not valid UTF-8"),
            Self::Io(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for ReadError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WriteError {
    Io(String),
}

impl fmt::Display for WriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for WriteError {}

pub trait FileSystem {
    fn read_utf8(&self, path: &Path) -> Result<String, ReadError>;

    /// Write UTF-8 without a BOM. The existing file is never truncated before
    /// the new bytes are safely in place.
    fn write_utf8(&self, path: &Path, content: &str) -> Result<(), WriteError>;

    /// Canonical path used for identity (case-insensitive on Windows).
    fn canonicalize(&self, path: &Path) -> PathBuf;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NativeFileSystem;

impl FileSystem for NativeFileSystem {
    fn read_utf8(&self, path: &Path) -> Result<String, ReadError> {
        let bytes = std::fs::read(path).map_err(|error| match error.kind() {
            ErrorKind::NotFound => ReadError::NotFound,
            _ => ReadError::Io(error.to_string()),
        })?;
        decode_utf8(&bytes)
    }

    fn write_utf8(&self, path: &Path, content: &str) -> Result<(), WriteError> {
        safe_write(path, content.as_bytes()).map_err(|error| WriteError::Io(error.to_string()))
    }

    fn canonicalize(&self, path: &Path) -> PathBuf {
        canonicalize_path(path)
    }
}

/// Decode UTF-8, dropping one leading byte-order mark if present.
pub fn decode_utf8(bytes: &[u8]) -> Result<String, ReadError> {
    let bytes = bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes);
    String::from_utf8(bytes.to_vec()).map_err(|_| ReadError::NotUtf8)
}

/// Write via a sibling temp file, fsync, then rename over the target.
fn safe_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    safe_write_with(path, |file| {
        file.write_all(bytes)?;
        file.sync_all()
    })
}

fn safe_write_with(
    path: &Path,
    write: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>,
) -> std::io::Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document.md".to_owned());

    let mut temp = None;
    for _ in 0..100 {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{file_name}.tmp-{}-{counter}", std::process::id()));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temp = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    let Some((temp_path, mut file)) = temp else {
        return Err(std::io::Error::new(
            ErrorKind::AlreadyExists,
            "could not create a temporary file",
        ));
    };

    let write_result = write(&mut file).and_then(|()| file.sync_all());
    drop(file);
    let result = write_result.and_then(|()| std::fs::rename(&temp_path, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Resolve a path for Document identity. Missing targets resolve through their
/// canonical parent so a new Save As path still compares consistently.
pub fn canonicalize_path(path: &Path) -> PathBuf {
    if let Ok(canonical) = path.canonicalize() {
        return canonical;
    }
    if let (Some(parent), Some(name)) = (path.parent(), path.file_name())
        && let Ok(canonical_parent) = parent.canonicalize()
    {
        return canonical_parent.join(name);
    }
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .unwrap_or_else(|_| path.to_path_buf())
    };
    normalize_lexically(&absolute)
}

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_plain_utf8() {
        assert_eq!(decode_utf8("héllo".as_bytes()).unwrap(), "héllo");
        assert_eq!(decode_utf8(b"").unwrap(), "");
    }

    #[test]
    fn strips_one_leading_bom() {
        assert_eq!(decode_utf8(b"\xEF\xBB\xBFhello").unwrap(), "hello");
        assert_eq!(
            decode_utf8(b"\xEF\xBB\xBF\xEF\xBB\xBFhello").unwrap(),
            "\u{feff}hello"
        );
    }

    #[test]
    fn rejects_non_utf8() {
        assert_eq!(
            decode_utf8(&[0xFF, 0xFE, 0x00]).unwrap_err(),
            ReadError::NotUtf8
        );
    }

    #[test]
    fn native_file_system_reads_bom_file_and_reports_missing_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.md");
        std::fs::write(&path, b"\xEF\xBB\xBF# Notes").unwrap();

        let fs = NativeFileSystem;
        assert_eq!(fs.read_utf8(&path).unwrap(), "# Notes");
        assert_eq!(
            fs.read_utf8(&dir.path().join("missing.md")).unwrap_err(),
            ReadError::NotFound
        );
    }

    #[test]
    fn safe_write_overwrites_with_utf8_and_no_bom() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.md");
        std::fs::write(&path, "old content").unwrap();

        NativeFileSystem
            .write_utf8(&path, "# héllo\n\ntext")
            .unwrap();

        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes, "# héllo\n\ntext".as_bytes());
        assert!(!bytes.starts_with(UTF8_BOM));
    }

    #[test]
    fn safe_write_failure_leaves_the_target_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("notes.md");
        std::fs::create_dir(&target).unwrap();
        let marker = target.join("keep.txt");
        std::fs::write(&marker, "old").unwrap();

        let error = NativeFileSystem.write_utf8(&target, "new").unwrap_err();

        assert!(matches!(error, WriteError::Io(_)));
        assert_eq!(std::fs::read_to_string(&marker).unwrap(), "old");
        assert!(target.is_dir());
    }

    #[test]
    fn failed_write_keeps_the_old_file_bytes_and_cleans_the_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("notes.md");
        std::fs::write(&target, "old content\n").unwrap();

        let error = safe_write_with(&target, |file| {
            file.write_all(b"partial new content")?;
            Err(std::io::Error::other("disk full"))
        })
        .unwrap_err();

        assert_eq!(error.to_string(), "disk full");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "old content\n");
        let entries: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(entries, [std::ffi::OsString::from("notes.md")]);
    }

    #[test]
    fn canonicalize_resolves_existing_and_new_paths() {
        let dir = tempfile::tempdir().unwrap();
        let existing = dir.path().join("notes.md");
        std::fs::write(&existing, "x").unwrap();
        let fs = NativeFileSystem;

        let canonical_existing = fs.canonicalize(&existing);
        assert!(canonical_existing.is_absolute());
        assert_eq!(canonical_existing.file_name().unwrap(), "notes.md");

        let new_path = dir.path().join("new.md");
        let canonical_new = fs.canonicalize(&new_path);
        assert_eq!(canonical_new.parent(), canonical_existing.parent());
        assert_eq!(canonical_new.file_name().unwrap(), "new.md");
    }

    #[test]
    fn only_web_and_mail_schemes_are_allowed() {
        for url in [
            "http://example.com",
            "https://example.com/a?b=c#d",
            "mailto:someone@example.com",
        ] {
            assert!(is_allowed_url(url), "{url}");
        }
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hi",
            "ftp://example.com",
            "http://",
            "mailto:",
            "https://example.com/a b",
            "https://example.com/\nnext",
            "C:\\docs\\notes.md",
        ] {
            assert!(!is_allowed_url(url), "{url}");
        }
    }

    #[test]
    fn open_url_refuses_other_schemes_without_spawning() {
        assert!(!open_url("file:///tmp/notes.md"));
        assert!(!open_url("not a url"));
    }
}
