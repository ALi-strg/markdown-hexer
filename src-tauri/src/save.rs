use std::fs;

/// Writes a Document's content to disk as UTF-8 (no BOM).
///
/// Returns `Err` with the OS message when the write fails so the frontend can
/// keep the Document Dirty and surface the failure.
pub fn write_document(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "markdownmagic-save-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn writes_the_documents_content_to_the_given_path() {
        let dir = temp_dir("write");
        let path = dir.join("note.md");
        write_document(path.to_str().unwrap(), "# Hello").expect("write should succeed");

        assert_eq!(fs::read_to_string(&path).unwrap(), "# Hello");

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn writes_clean_utf8_without_a_bom() {
        let dir = temp_dir("no-bom");
        let path = dir.join("note.md");
        write_document(path.to_str().unwrap(), "# Hello").expect("write should succeed");

        let bytes = fs::read(&path).unwrap();
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert_eq!(String::from_utf8(bytes).unwrap(), "# Hello");

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn returns_an_error_when_the_path_is_unwritable() {
        let dir = temp_dir("unwritable");
        let blocker = dir.join("blocker");
        fs::write(&blocker, "").expect("create blocker file");
        let bad_path = blocker.join("note.md");

        let result = write_document(bad_path.to_str().unwrap(), "x");

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }
}
