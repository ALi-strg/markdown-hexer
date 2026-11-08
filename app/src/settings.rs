//! Persisted appearance settings.
//!
//! One small JSON file, loaded before the window and written atomically. A
//! missing, unreadable, or corrupt file quietly falls back to the defaults, so
//! a bad settings file can never stop the app from starting.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const SETTINGS_VERSION: u32 = 1;
const FILE_NAME: &str = "settings.json";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    System,
    #[default]
    Light,
    House,
    Dark,
    HighContrast,
    Nord,
    TerminalGreen,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FontChoice {
    #[default]
    Default,
    Serif,
    Sans,
    Mono,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TextSize {
    Small,
    #[default]
    Medium,
    Large,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub version: u32,
    pub theme: Theme,
    pub font: FontChoice,
    pub text_size: TextSize,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            theme: Theme::default(),
            font: FontChoice::default(),
            text_size: TextSize::default(),
        }
    }
}

impl Settings {
    /// Reads the settings file. Any failure returns the defaults; a version
    /// this build does not know is treated as unreadable rather than guessed.
    pub fn load(path: &Path) -> Self {
        let Ok(text) = std::fs::read_to_string(path) else {
            return Self::default();
        };
        let Ok(settings) = serde_json::from_str::<Self>(&text) else {
            return Self::default();
        };
        if settings.version != SETTINGS_VERSION {
            return Self::default();
        }
        settings
    }

    /// Writes through a sibling temp file and renames it into place so a crash
    /// never leaves a half-written settings file.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create settings folder: {error}"))?;
        }
        let json = serde_json::to_vec_pretty(self)
            .map_err(|error| format!("Could not encode settings: {error}"))?;
        let temp = temp_path(path);
        std::fs::write(&temp, json)
            .map_err(|error| format!("Could not write settings: {error}"))?;
        std::fs::rename(&temp, path)
            .map_err(|error| format!("Could not replace settings: {error}"))?;
        Ok(())
    }
}

impl Theme {
    pub const ALL: [Self; 7] = [
        Self::System,
        Self::Light,
        Self::House,
        Self::Dark,
        Self::HighContrast,
        Self::Nord,
        Self::TerminalGreen,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::System => "System",
            Self::Light => "Light",
            Self::House => "House",
            Self::Dark => "Dark",
            Self::HighContrast => "High Contrast",
            Self::Nord => "Nord",
            Self::TerminalGreen => "Terminal Green",
        }
    }
}

impl FontChoice {
    pub const ALL: [Self; 4] = [Self::Default, Self::Serif, Self::Sans, Self::Mono];

    pub fn label(self) -> &'static str {
        match self {
            Self::Default => "Default",
            Self::Serif => "Serif",
            Self::Sans => "Sans",
            Self::Mono => "Mono",
        }
    }

    /// The editor is a code surface, so Default keeps its monospace face.
    pub fn editor_family(self) -> egui::FontFamily {
        match self {
            Self::Default => egui::FontFamily::Monospace,
            Self::Serif => egui::FontFamily::Name(CONTENT_SERIF.into()),
            Self::Sans => egui::FontFamily::Name(CONTENT_SANS.into()),
            Self::Mono => egui::FontFamily::Name(CONTENT_MONO.into()),
        }
    }

    /// Preview prose is proportional by default; the explicit families stay
    /// distinct so choosing one changes both panes.
    pub fn preview_family(self) -> egui::FontFamily {
        match self {
            Self::Default => egui::FontFamily::Proportional,
            Self::Serif => egui::FontFamily::Name(CONTENT_SERIF.into()),
            Self::Sans => egui::FontFamily::Name(CONTENT_SANS.into()),
            Self::Mono => egui::FontFamily::Name(CONTENT_MONO.into()),
        }
    }
}

pub const CONTENT_SERIF: &str = "content-serif";
pub const CONTENT_SANS: &str = "content-sans";
pub const CONTENT_MONO: &str = "content-mono";

impl TextSize {
    pub const ALL: [Self; 3] = [Self::Small, Self::Medium, Self::Large];

    pub fn label(self) -> &'static str {
        match self {
            Self::Small => "Small",
            Self::Medium => "Medium",
            Self::Large => "Large",
        }
    }

    /// Content point sizes mirror v1: editor 12/14/16, Preview 13/15/17.
    pub fn editor_size(self) -> f32 {
        match self {
            Self::Small => 12.0,
            Self::Medium => 14.0,
            Self::Large => 16.0,
        }
    }

    pub fn preview_size(self) -> f32 {
        match self {
            Self::Small => 13.0,
            Self::Medium => 15.0,
            Self::Large => 17.0,
        }
    }
}

fn temp_path(path: &Path) -> PathBuf {
    let mut file = path.file_name().unwrap_or_default().to_os_string();
    file.push(".tmp");
    path.with_file_name(file)
}

/// The platform config directory for the app, never a scan of the directory.
pub fn default_path() -> Option<PathBuf> {
    if cfg!(windows) {
        let base = std::env::var_os("APPDATA")?;
        Some(PathBuf::from(base).join("markdown-hexer").join(FILE_NAME))
    } else if cfg!(target_os = "macos") {
        let base = std::env::var_os("HOME")?;
        Some(
            PathBuf::from(base)
                .join("Library")
                .join("Application Support")
                .join("markdown-hexer")
                .join(FILE_NAME),
        )
    } else {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
        Some(base.join("markdown-hexer").join(FILE_NAME))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_light_medium_default() {
        let settings = Settings::default();
        assert_eq!(settings.theme, Theme::Light);
        assert_eq!(settings.text_size, TextSize::Medium);
        assert_eq!(settings.font, FontChoice::Default);
        assert_eq!(settings.version, SETTINGS_VERSION);
    }

    #[test]
    fn roundtrips_exactly_through_a_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        let settings = Settings {
            theme: Theme::Nord,
            font: FontChoice::Serif,
            text_size: TextSize::Large,
            ..Settings::default()
        };
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path), settings);
        assert!(!dir.path().join("nested").join("settings.json.tmp").exists());
    }

    #[test]
    fn saving_over_an_existing_file_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        Settings {
            theme: Theme::Light,
            ..Settings::default()
        }
        .save(&path)
        .unwrap();
        let updated = Settings {
            theme: Theme::TerminalGreen,
            font: FontChoice::Mono,
            text_size: TextSize::Small,
            ..Settings::default()
        };
        updated.save(&path).unwrap();
        assert_eq!(Settings::load(&path), updated);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn human_readable_keys_are_kebab_case() {
        let settings = Settings {
            theme: Theme::HighContrast,
            font: FontChoice::Mono,
            text_size: TextSize::Small,
            ..Settings::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"high-contrast\""), "{json}");
        assert!(json.contains("\"mono\""), "{json}");
        assert!(json.contains("\"small\""), "{json}");
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }

    #[test]
    fn unknown_fields_are_ignored_and_dropped_on_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"version":1,"theme":"dark","font":"sans","text_size":"large","future":"yes"}"#,
        )
        .unwrap();
        let loaded = Settings::load(&path);
        assert_eq!(loaded.theme, Theme::Dark);
        assert_eq!(loaded.font, FontChoice::Sans);
        assert_eq!(loaded.text_size, TextSize::Large);
        loaded.save(&path).unwrap();
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(!saved.contains("future"), "{saved}");
    }

    #[test]
    fn missing_fields_use_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"theme":"house"}"#).unwrap();
        let loaded = Settings::load(&path);
        assert_eq!(loaded.theme, Theme::House);
        assert_eq!(loaded.font, FontChoice::Default);
        assert_eq!(loaded.text_size, TextSize::Medium);
        assert_eq!(loaded.version, SETTINGS_VERSION);

        std::fs::write(&path, "{}").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }

    #[test]
    fn unknown_version_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"version":99,"theme":"terminal-green","font":"serif","text_size":"small"}"#,
        )
        .unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }

    #[test]
    fn text_sizes_match_v1_editor_and_preview_scales() {
        assert_eq!(TextSize::Small.editor_size(), 12.0);
        assert_eq!(TextSize::Medium.editor_size(), 14.0);
        assert_eq!(TextSize::Large.editor_size(), 16.0);
        assert_eq!(TextSize::Small.preview_size(), 13.0);
        assert_eq!(TextSize::Medium.preview_size(), 15.0);
        assert_eq!(TextSize::Large.preview_size(), 17.0);
    }

    #[test]
    fn font_choices_map_to_content_families() {
        use egui::FontFamily;
        assert_eq!(FontChoice::Default.editor_family(), FontFamily::Monospace);
        assert_eq!(
            FontChoice::Default.preview_family(),
            FontFamily::Proportional
        );
        assert_eq!(
            FontChoice::Serif.editor_family(),
            FontFamily::Name(CONTENT_SERIF.into())
        );
        assert_eq!(
            FontChoice::Serif.preview_family(),
            FontFamily::Name(CONTENT_SERIF.into())
        );
        assert_eq!(
            FontChoice::Sans.editor_family(),
            FontFamily::Name(CONTENT_SANS.into())
        );
        assert_eq!(
            FontChoice::Mono.preview_family(),
            FontFamily::Name(CONTENT_MONO.into())
        );
        assert_eq!(
            FontChoice::Sans.preview_family(),
            FontFamily::Name(CONTENT_SANS.into())
        );
    }

    #[test]
    fn default_path_is_the_app_config_file_not_a_scan() {
        let path = default_path();
        if cfg!(windows) && std::env::var_os("APPDATA").is_some() {
            let path = path.expect("APPDATA gives a settings path");
            assert!(
                path.ends_with("markdown-hexer\\settings.json")
                    || path.ends_with("markdown-hexer/settings.json")
            );
        } else if let Some(path) = path {
            assert!(path.ends_with("markdown-hexer/settings.json"));
            assert_eq!(path.file_name().unwrap(), "settings.json");
        }
    }
}
