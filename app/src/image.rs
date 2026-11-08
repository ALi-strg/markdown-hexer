use std::path::{Component, Path, PathBuf};

/// What the Preview should do with one image destination from the Markdown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ImageTarget {
    /// A readable file proven to live under the Document directory.
    Local(PathBuf),
    /// An http(s) image; the renderer may fetch it lazily.
    Remote,
    /// Anything else: show the alt text instead of attempting a load.
    Alt,
}

/// The seam between Markdown image destinations and the file system. Tests
/// substitute this so image policy can be exercised without touching disk or
/// the network.
pub trait ImageSource {
    fn resolve(&self, scope: Option<&Path>, destination: &str) -> ImageTarget;
}

pub struct NativeImageSource;

impl ImageSource for NativeImageSource {
    fn resolve(&self, scope: Option<&Path>, destination: &str) -> ImageTarget {
        if is_remote(destination) {
            return ImageTarget::Remote;
        }
        let Some(scope) = scope else {
            return ImageTarget::Alt;
        };
        let Some(relative) = local_path(destination) else {
            return ImageTarget::Alt;
        };
        resolve_local(scope, &relative)
            .map(ImageTarget::Local)
            .unwrap_or(ImageTarget::Alt)
    }
}

fn is_remote(destination: &str) -> bool {
    let lower = destination.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

/// Turn a Markdown destination into a relative path. Absolute paths, schemes
/// and any parent/root component are refused before the file system is asked.
fn local_path(destination: &str) -> Option<PathBuf> {
    let decoded = percent_decode(destination.as_bytes())?;
    let decoded = String::from_utf8(decoded).ok()?;
    if decoded.is_empty()
        || decoded
            .split(['/', '\\'])
            .any(|segment| segment == ".." || segment == "~")
    {
        return None;
    }

    let path = Path::new(&decoded);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_) | Component::RootDir | Component::ParentDir
            )
        })
    {
        return None;
    }
    Some(path.to_path_buf())
}

fn resolve_local(scope: &Path, relative: &Path) -> Option<PathBuf> {
    let scope = scope.canonicalize().ok()?;
    if !scope.is_dir() {
        return None;
    }
    let target = scope.join(relative).canonicalize().ok()?;
    if !target.starts_with(&scope) || !target.is_file() {
        return None;
    }
    Some(target)
}

/// A `file://` URI for an absolute path, with every character that would break
/// a Markdown destination percent-encoded.
pub fn file_uri(path: &Path) -> String {
    let mut path = path.to_string_lossy().replace('\\', "/");
    if let Some(rest) = path.strip_prefix("//?/UNC/") {
        path = format!("//{rest}");
    } else if let Some(rest) = path.strip_prefix("//?/") {
        path = rest.to_owned();
    }
    if !path.starts_with('/') {
        path.insert(0, '/');
    }

    let mut uri = String::from("file://");
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b':' | b'-' | b'_' | b'.' | b'~') {
            uri.push(byte as char);
        } else {
            uri.push_str(&format!("%{byte:02X}"));
        }
    }
    uri
}

/// Decode valid `%XX` escapes, leaving malformed escapes alone. Markdown
/// destinations are URL-encoded, but image paths on disk are not.
fn percent_decode(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2]))
        {
            out.push((high << 4) | low);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    Some(out)
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source() -> NativeImageSource {
        NativeImageSource
    }

    #[test]
    fn accepts_files_inside_the_document_directory() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir(directory.path().join("assets")).unwrap();
        let image = directory.path().join("assets").join("one.png");
        std::fs::write(&image, b"not-a-real-png").unwrap();

        let target = source().resolve(Some(directory.path()), "assets/one.png");
        assert_eq!(ImageTarget::Local(image.canonicalize().unwrap()), target);
    }

    #[test]
    fn rejects_missing_absolute_parent_and_scheme_destinations() {
        let directory = tempfile::tempdir().unwrap();
        let absolute = directory.path().join("one.png");
        std::fs::write(&absolute, b"x").unwrap();
        let absolute = absolute.to_string_lossy().replace('\\', "/");

        for destination in [
            "missing.png".to_owned(),
            format!("/{absolute}"),
            absolute,
            "../outside.png".to_owned(),
            "assets/../../outside.png".to_owned(),
            "..\\outside.png".to_owned(),
            "file:///etc/passwd".to_owned(),
            "data:image/png;base64,AAAA".to_owned(),
            "javascript:alert(1)".to_owned(),
        ] {
            assert_eq!(
                source().resolve(Some(directory.path()), &destination),
                ImageTarget::Alt,
                "accepted {destination:?}"
            );
        }
    }

    #[test]
    fn rejects_local_images_without_a_document_directory() {
        assert_eq!(source().resolve(None, "one.png"), ImageTarget::Alt);
        assert_eq!(
            source().resolve(None, "https://example.com/one.png"),
            ImageTarget::Remote
        );
    }

    #[test]
    fn decodes_percent_escapes_and_emits_a_safe_file_uri() {
        let directory = tempfile::tempdir().unwrap();
        let image = directory.path().join("two words#1.png");
        std::fs::write(&image, b"x").unwrap();

        let target = source().resolve(Some(directory.path()), "two%20words%231.png");
        let ImageTarget::Local(path) = target else {
            panic!("expected local image");
        };
        assert_eq!(path, image.canonicalize().unwrap());
        let uri = file_uri(&path);
        assert!(uri.starts_with("file:///"));
        assert!(uri.ends_with("two%20words%231.png"));
    }

    #[test]
    fn file_uri_round_trips_through_the_egui_file_loader() {
        use egui::load::{BytesLoader, BytesPoll};

        let directory = tempfile::tempdir().unwrap();
        let image = directory.path().join("one image.png");
        std::fs::write(&image, b"image bytes").unwrap();
        let loader = egui_extras::loaders::file_loader::FileLoader::default();
        let ctx = egui::Context::default();
        let poll = loop {
            match loader.load(&ctx, &file_uri(&image)).unwrap() {
                BytesPoll::Pending { .. } => {
                    std::thread::sleep(std::time::Duration::from_millis(5))
                }
                ready => break ready,
            }
        };
        let BytesPoll::Ready { bytes, .. } = poll else {
            panic!("file loader was not ready");
        };
        assert_eq!(&*bytes, b"image bytes");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_that_escape_the_document_directory() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let outside_image = outside.path().join("secret.png");
        std::fs::write(&outside_image, b"x").unwrap();
        std::os::unix::fs::symlink(&outside_image, directory.path().join("link.png")).unwrap();

        assert_eq!(
            source().resolve(Some(directory.path()), "link.png"),
            ImageTarget::Alt
        );
    }

    #[cfg(windows)]
    #[test]
    fn rejects_symlinks_that_escape_the_document_directory() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let outside_image = outside.path().join("secret.png");
        std::fs::write(&outside_image, b"x").unwrap();
        let link = directory.path().join("link.png");
        if std::os::windows::fs::symlink_file(&outside_image, &link).is_err() {
            return; // Symlink creation needs privilege/developer mode.
        }

        assert_eq!(
            source().resolve(Some(directory.path()), "link.png"),
            ImageTarget::Alt
        );
    }
}
