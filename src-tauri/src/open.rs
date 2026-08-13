use crate::encoding;

/// Reads a Document's content from disk as UTF-8.
///
/// Strips a single leading BOM so Notepad-era files open cleanly; files that
/// are not valid UTF-8 return `Err` with the OS message so the frontend can
/// surface the failure and keep the current Document.
pub fn read_document(path: &str) -> Result<String, String> {
    encoding::read_utf8(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "markdownhexer-open-test-{}-{}",
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
    fn strips_a_leading_bom_when_reading() {
        let dir = temp_dir("bom");
        let path = dir.join("note.md");
        fs::write(&path, b"\xEF\xBB\xBF# Hello").expect("write BOM fixture");

        assert_eq!(read_document(path.to_str().unwrap()).unwrap(), "# Hello");

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn returns_an_error_for_a_file_that_is_not_utf8() {
        let dir = temp_dir("non-utf8");
        let path = dir.join("note.md");
        fs::write(&path, [0xFF, 0xFE, b'#', b' ', b'X']).expect("write fixture");

        assert!(read_document(path.to_str().unwrap()).is_err());

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
