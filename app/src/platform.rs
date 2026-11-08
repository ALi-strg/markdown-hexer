use std::fmt;
use std::io::ErrorKind;
use std::path::Path;

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

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

pub trait FileSystem {
    fn read_utf8(&self, path: &Path) -> Result<String, ReadError>;
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
}

/// Decode UTF-8, dropping one leading byte-order mark if present.
pub fn decode_utf8(bytes: &[u8]) -> Result<String, ReadError> {
    let bytes = bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes);
    String::from_utf8(bytes.to_vec()).map_err(|_| ReadError::NotUtf8)
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
}
