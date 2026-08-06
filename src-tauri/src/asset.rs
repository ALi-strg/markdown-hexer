use percent_encoding::percent_decode;
use std::path::{Path, PathBuf};
use tauri::http::{header::CONTENT_TYPE, Request, Response, StatusCode};

/// The current Document's canonical path, the scope root for every `asset://`
/// request. A `None` Document (an Untitled Document) serves no assets at all.
pub struct DocumentScope(pub std::sync::Mutex<Option<String>>);

/// Tells the `asset://` protocol which directory to scope itself to.
///
/// The frontend calls this whenever the Document's canonical path changes (New,
/// Open, Save As). `None` clears the scope for an Untitled Document.
#[tauri::command]
pub fn set_asset_root(
    state: tauri::State<'_, DocumentScope>,
    document_path: Option<String>,
) {
    *state.0.lock().unwrap() = document_path;
}

/// Serves one `asset://` request against the current Document's directory.
///
/// The request's percent-encoded path is decoded to an absolute filesystem
/// path, resolved through [`resolve_asset_path`] (which enforces directory
/// scoping), and read back. Out-of-scope requests get a 403; a Document with no
/// path gets a 403; a missing file gets a 404.
pub fn serve(request: Request<Vec<u8>>, document_path: Option<String>) -> Response<Vec<u8>> {
    let requested = percent_decode(request.uri().path().trim_start_matches('/').as_bytes())
        .decode_utf8_lossy()
        .to_string();
    let resolved = match document_path {
        Some(path) => resolve_asset_path(&path, &requested),
        None => Err("no Document is loaded".to_string()),
    };
    let path = match resolved {
        Ok(path) => path,
        Err(_) => return empty_response(StatusCode::FORBIDDEN),
    };
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => return empty_response(StatusCode::NOT_FOUND),
    };
    let mime_type =
        tauri::utils::mime_type::MimeType::parse(&bytes, &path.to_string_lossy());
    Response::builder()
        .header(CONTENT_TYPE, mime_type)
        .body(bytes)
        .expect("response is constructible")
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("response is constructible")
}

/// The directory an asset request must stay inside: the directory that holds
/// the current Document. Returns an error when the Document has no directory
/// (for example it is still Untitled).
pub fn document_directory(document_path: &str) -> Result<PathBuf, String> {
    let dir = Path::new(document_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "document has no directory".to_string())?;
    std::fs::canonicalize(dir).map_err(|e| e.to_string())
}

/// Resolves a requested asset path against the Document's directory.
///
/// Directory scoping: the requested path must be absolute and, once
/// canonicalized (so symlinks and `..` cannot sneak out), must live inside the
/// Document's directory. Anything else is rejected.
pub fn resolve_asset_path(
    document_path: &str,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let scope_root = document_directory(document_path)?;
    let requested = Path::new(requested_path);
    if !requested.is_absolute() {
        return Err("asset path must be absolute".to_string());
    }
    let canonical = std::fs::canonicalize(requested).map_err(|e| e.to_string())?;
    if canonical.starts_with(&scope_root) {
        Ok(canonical)
    } else {
        Err("asset path is outside the Document's directory".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "alimd-asset-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn allows_an_image_next_to_the_document() {
        let dir = temp_dir("same-dir");
        let document = dir.join("note.md");
        let image = dir.join("pic.png");
        fs::write(&document, "# note").expect("write fixture");
        fs::write(&image, "png").expect("write fixture");

        let resolved = resolve_asset_path(
            document.to_str().unwrap(),
            image.to_str().unwrap(),
        )
        .expect("sibling image should be allowed");

        assert_eq!(resolved, fs::canonicalize(&image).unwrap());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn allows_an_image_in_a_subdirectory_of_the_documents_directory() {
        let dir = temp_dir("subdir");
        let assets = dir.join("assets");
        fs::create_dir_all(&assets).expect("create assets dir");
        let document = dir.join("note.md");
        let image = assets.join("pic.png");
        fs::write(&document, "# note").expect("write fixture");
        fs::write(&image, "png").expect("write fixture");

        let resolved = resolve_asset_path(
            document.to_str().unwrap(),
            image.to_str().unwrap(),
        )
        .expect("nested image should be allowed");

        assert_eq!(resolved, fs::canonicalize(&image).unwrap());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn rejects_an_absolute_path_outside_the_documents_directory() {
        let dir = temp_dir("outside");
        let other = temp_dir("outside-other");
        let document = dir.join("note.md");
        let image = other.join("secret.png");
        fs::write(&document, "# note").expect("write fixture");
        fs::write(&image, "png").expect("write fixture");

        let result =
            resolve_asset_path(document.to_str().unwrap(), image.to_str().unwrap());

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
        fs::remove_dir_all(other).expect("clean up temp dir");
    }

    #[test]
    fn rejects_a_relative_request_path() {
        let dir = temp_dir("relative");
        let document = dir.join("note.md");
        fs::write(&document, "# note").expect("write fixture");

        let result = resolve_asset_path(document.to_str().unwrap(), "pic.png");

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn rejects_a_symlink_that_escapes_the_documents_directory() {
        let dir = temp_dir("symlink");
        let outside = temp_dir("symlink-outside");
        let secret = outside.join("secret.png");
        fs::write(&secret, "png").expect("write fixture");
        let document = dir.join("note.md");
        fs::write(&document, "# note").expect("write fixture");
        let link = dir.join("link.png");
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&secret, &link);
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&secret, &link);
        if linked.is_err() {
            // Windows often lacks symlink privileges in CI; skip rather than fail.
            fs::remove_dir_all(dir).expect("clean up temp dir");
            fs::remove_dir_all(outside).expect("clean up temp dir");
            return;
        }

        let result =
            resolve_asset_path(document.to_str().unwrap(), link.to_str().unwrap());

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
        fs::remove_dir_all(outside).expect("clean up temp dir");
    }

    #[test]
    fn rejects_when_the_requested_file_does_not_exist() {
        let dir = temp_dir("missing");
        let document = dir.join("note.md");
        fs::write(&document, "# note").expect("write fixture");

        let result = resolve_asset_path(
            document.to_str().unwrap(),
            dir.join("absent.png").to_str().unwrap(),
        );

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn rejects_when_the_document_has_no_directory() {
        let result = resolve_asset_path("note.md", "/some/absolute/path.png");
        assert!(result.is_err());
    }
}
