# Two-mode document model replacing split view

## Status

Accepted

## Context

1.x has three Layout Modes — Split View, Preview Only, Focus Mode — stored per Document, with Synced Scrolling in Split View. Split View keeps a CodeMirror instance and a rendered preview alive side by side. The rewrite makes Preview the default and loads the editor lazily; a split view would force editor initialization onto the default path and double the rendering surface. The owner's workflow is preview-first; side-by-side source and preview is not required.

## Decision

Each Document has one Mode: **Preview** or **Edit**.

- Open (including a file passed at launch) → Preview. New (including a bare launch) → Edit.
- Preview fills the window with the Preview View; Edit fills it with the Editor View. There is no split view.
- The editor initializes on the first switch to Edit. A Preview launch constructs no editor state.
- Mode is per Document, remembered for the session, and not persisted across launches.
- The Mode Switcher (Preview / Edit) is always visible; Cmd/Ctrl+E toggles it.
- Find & Replace is Edit-only; invoking it from Preview switches to Edit first.
- Formatting Buttons are Edit-only; their shortcuts no-op in Preview.
- Copy-on-Select and the Code Copy Button are Preview-only.
- Synced Scrolling is removed. Sections keep their collapse state across Mode switches.
- Vocabulary: **Mode**, **Preview**, **Edit**, **Mode Switcher**, **Editor View**, **Preview View**. Split View, Preview Only, Focus Mode, Layout Switcher, Editor Pane, Preview Pane, and Synced Scrolling are retired.

## Consequences

Users cannot see source and preview at once; they toggle. Preview scroll and editor cursor/scroll are preserved across toggles. The old auto-choice (`New → Split`, `Open → Preview Only`) becomes `New → Edit`, `Open → Preview`. The Mode Switcher is simpler than the three-way control. Tests and docs that assume Split View, Synced Scrolling, or pane geometry must be rewritten. The editor's first-Edit budget becomes a startup-adjacent performance gate.

## Alternatives considered

- **Keep Split View** — rejected: forces editor initialization on the default path and doubles the preview and editor surfaces for a workflow the owner does not use.
- **Preview Only** — rejected: editing is still a core feature.
- **Three Modes** — rejected: extra states and transitions without a user need.
