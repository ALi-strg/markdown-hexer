use std::fs;

/// Reads a Document's content from disk as UTF-8.
///
/// Returns `Err` with the OS message when the file cannot be read so the
/// frontend can surface the failure and keep the current Document.
pub fn read_document(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "alimd-open-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn reads_the_documents_content_from_the_given_path() {
        let dir = temp_dir("read");
        let path = dir.join("note.md");
        fs::write(&path, "# Hello").expect("write fixture");

        assert_eq!(read_document(path.to_str().unwrap()).unwrap(), "# Hello");

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn returns_an_error_when_the_file_does_not_exist() {
        let dir = temp_dir("missing");
        let path = dir.join("absent.md");

        assert!(read_document(path.to_str().unwrap()).is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }
}
