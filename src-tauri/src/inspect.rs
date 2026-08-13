use std::fs;
use std::time::UNIX_EPOCH;

use crate::encoding;

/// The on-disk state of a Document's file: its content and last-modified time.
///
/// The frontend compares `content` against the state it saw at load/save time
/// to detect an Externally-Modified file on window focus.
#[derive(serde::Serialize)]
pub struct FileState {
    pub content: String,
    pub mtime_ms: u64,
}

/// Inspects the Document's file on disk.
///
/// Returns the file's UTF-8 content (BOM stripped, matching the Open read) and
/// modified time in milliseconds since the Unix epoch. Returns `Err` with the
/// OS message when the file cannot be read (for example, it was deleted or
/// moved while the app had it open).
pub fn inspect_document(path: &str) -> Result<FileState, String> {
    let content = encoding::read_utf8(path)?;
    let mtime_ms = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileState { content, mtime_ms })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "markdownhexer-inspect-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn returns_the_files_content_and_modified_time() {
        let dir = temp_dir("read");
        let path = dir.join("note.md");
        fs::write(&path, "# On disk").expect("write fixture");

        let state = inspect_document(path.to_str().unwrap()).expect("inspect should succeed");

        assert_eq!(state.content, "# On disk");
        assert!(state.mtime_ms > 0);

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn strips_a_leading_bom_like_the_open_read() {
        let dir = temp_dir("bom");
        let path = dir.join("note.md");
        fs::write(&path, b"\xEF\xBB\xBF# On disk").expect("write BOM fixture");

        let state = inspect_document(path.to_str().unwrap()).expect("inspect should succeed");

        assert_eq!(state.content, "# On disk");

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn returns_an_error_when_the_file_does_not_exist() {
        let dir = temp_dir("missing");
        let path = dir.join("absent.md");

        assert!(inspect_document(path.to_str().unwrap()).is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }
}
