use std::fs;

/// Reads a file as UTF-8, stripping a single leading BOM so Notepad-era files
/// open cleanly. Files that are not valid UTF-8 return `Err` with the OS
/// message rather than being silently mangled.
///
/// Both the Open read and the Externally-Modified inspection use this so a BOM
/// file is never falsely flagged as changed against the content the app loaded.
pub fn read_utf8(path: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(content
        .strip_prefix('\u{feff}')
        .unwrap_or(&content)
        .to_string())
}
