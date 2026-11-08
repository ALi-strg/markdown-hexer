//! The Find & Replace panel. Search state lives on the Document; only the
//! open flag and replacement text are UI-local.

use egui::widgets::text_edit::TextEditState;
use egui::{Frame, Id, Key, Margin, Modifiers, Panel, TextEdit, Ui};

use crate::domain::{Command, DocumentId, Mode};
use crate::find;

use super::{HexerApp, editor_id};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    Previous,
    Next,
    Replace,
    ReplaceAll,
}

impl HexerApp {
    pub(super) fn show_find_panel(&mut self, ui: &mut Ui) -> Vec<Command> {
        if !self.find_open {
            return Vec::new();
        }
        let Some(document) = self.workspace.active_document() else {
            self.find_open = false;
            return Vec::new();
        };
        // Find & Replace is Edit-only; Preview hides it without losing state.
        if document.mode != Mode::Edit {
            return Vec::new();
        }

        let document_id = document.id;
        let mut query = document.find.query.clone();
        let original_query = query.clone();
        let current = document.find.current;
        let content = document.content.clone();
        let focus_query = std::mem::take(&mut self.focus_find);
        let palette = self.palette;
        let mut commands = Vec::new();
        let mut action = None;
        let mut close = false;
        let mut query_focused = false;

        Panel::top("find_panel")
            .frame(
                Frame::new()
                    .fill(palette.bg)
                    .inner_margin(Margin::symmetric(12, 5)),
            )
            .show(ui, |ui| {
                let query_id = Id::unique(("find_query", document_id));
                query_focused = ui.memory(|memory| memory.has_focus(query_id));
                if query_focused {
                    if ui.input_mut(|input| input.consume_key(Modifiers::SHIFT, Key::Enter)) {
                        action = Some(Action::Previous);
                    } else if ui.input_mut(|input| input.consume_key(Modifiers::NONE, Key::Enter)) {
                        action = Some(Action::Next);
                    }
                }

                ui.horizontal(|ui| {
                    ui.label("Find");
                    let response = ui.add(
                        TextEdit::singleline(&mut query)
                            .id(query_id)
                            .hint_text("Find")
                            .desired_width(180.0),
                    );
                    if focus_query {
                        response.request_focus();
                    }
                    let total = find::matches(&content, &query).len();
                    let status = if query.is_empty() {
                        "0 of 0".to_owned()
                    } else if total == 0 {
                        "No matches".to_owned()
                    } else {
                        format!("{} of {}", current.min(total - 1) + 1, total)
                    };
                    ui.label(status);
                    if ui.button("Previous").clicked() {
                        action = Some(Action::Previous);
                    }
                    if ui.button("Next").clicked() {
                        action = Some(Action::Next);
                    }
                    if ui.button("Close").clicked() {
                        close = true;
                    }
                });

                ui.horizontal(|ui| {
                    ui.label("Replace");
                    ui.add(
                        TextEdit::singleline(&mut self.replace_text)
                            .id(Id::unique(("find_replace", document_id)))
                            .hint_text("Replace with")
                            .desired_width(180.0),
                    );
                    if ui.button("Replace").clicked() {
                        action = Some(Action::Replace);
                    }
                    if ui.button("Replace All").clicked() {
                        action = Some(Action::ReplaceAll);
                    }
                });
            });

        let current = if query != original_query { 0 } else { current };
        let match_count = find::matches(&content, &query).len();
        if query != original_query {
            commands.push(Command::Find { query });
        }
        match action {
            Some(Action::Next) => commands.push(Command::FindNext),
            Some(Action::Previous) => commands.push(Command::FindPrevious),
            Some(Action::Replace) if current < match_count => {
                push_replace_undo(ui.ctx(), document_id, &content);
                commands.push(Command::Replace {
                    replacement: self.replace_text.clone(),
                });
            }
            Some(Action::ReplaceAll) if match_count > 0 => {
                push_replace_undo(ui.ctx(), document_id, &content);
                commands.push(Command::ReplaceAll {
                    replacement: self.replace_text.clone(),
                });
            }
            _ => {}
        }

        if close {
            self.find_open = false;
            self.focus_editor = true;
        } else if matches!(action, Some(Action::Replace | Action::ReplaceAll)) {
            // After a replacement the editor should own the keyboard again.
            self.focus_editor = true;
        } else if action.is_some() && query_focused {
            self.focus_find = true;
        } else if action.is_some() {
            self.focus_editor = true;
        }

        commands
    }
}

/// Make the replacement its own undo point, otherwise Cmd+Z would jump to the
/// last state the editor's timer captured (possibly before recent typing).
fn push_replace_undo(ctx: &egui::Context, document_id: DocumentId, content: &str) {
    let id = editor_id(document_id);
    let Some(mut state) = TextEditState::load(ctx, id) else {
        return;
    };
    let cursor = state.cursor.char_range().unwrap_or_default();
    let mut undoer = state.undoer();
    undoer.add_undo(&(cursor, content.to_owned()));
    state.set_undoer(undoer);
    state.store(ctx, id);
}
