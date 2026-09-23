use base64::Engine as _;
use std::fs;

/// Reads an image file as a base64 data URL for HTML Export image inlining.
///
/// `document_path` scopes the read: the image must resolve inside the same
/// Document directory the `asset://` protocol enforces, so an export can never
/// embed a file from outside it. The base64 encoding is standard padded
/// (`Engine::base64_engine`), the data URL format browsers require.
///
/// ponytail: one whole-image base64 string per call — image-heavy Documents
/// export slowly and large; dedupe repeated images and add size limits when
/// that matters in practice (ADR 0012 Consequences).
pub fn read_image_data_url(document_path: &str, image_path: &str) -> Result<String, String> {
    let path = super::asset::resolve_asset_path(document_path, image_path)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mime_type =
        tauri::utils::mime_type::MimeType::parse(&bytes, &path.to_string_lossy());
    let data_url = format!(
        "data:{mime_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    Ok(data_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "markdownhexer-image-test-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn encodes_a_local_image_as_a_data_url() {
        let dir = temp_dir("local");
        let document = dir.join("note.md");
        let image = dir.join("pic.png");
        fs::write(&document, "# note").expect("write fixture");
        fs::write(&image, b"\x89PNG\r\n\x1a\nraw").expect("write fixture");

        let data_url = read_image_data_url(
            document.to_str().unwrap(),
            image.to_str().unwrap(),
        )
        .expect("sibling image should be readable");

        assert!(data_url.starts_with("data:image/png;base64,"));
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(data_url.rsplit(',').next().unwrap())
                .unwrap(),
            b"\x89PNG\r\n\x1a\nraw"
        );

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }

    #[test]
    fn rejects_an_image_outside_the_documents_directory() {
        let dir = temp_dir("outside");
        let other = temp_dir("outside-other");
        let document = dir.join("note.md");
        let image = other.join("secret.png");
        fs::write(&document, "# note").expect("write fixture");
        fs::write(&image, "png").expect("write fixture");

        let result = read_image_data_url(
            document.to_str().unwrap(),
            image.to_str().unwrap(),
        );

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
        fs::remove_dir_all(other).expect("clean up temp dir");
    }

    #[test]
    fn rejects_a_missing_image() {
        let dir = temp_dir("missing");
        let document = dir.join("note.md");
        fs::write(&document, "# note").expect("write fixture");

        let result = read_image_data_url(
            document.to_str().unwrap(),
            dir.join("absent.png").to_str().unwrap(),
        );

        assert!(result.is_err());

        fs::remove_dir_all(dir).expect("clean up temp dir");
    }
}
