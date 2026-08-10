# Spec: Multi-Tab workspace (multiple open Documents)

Status: ready-for-agent

## Problem Statement

The app can hold exactly one Document at a time — a deliberate choice recorded in ADR-0003 that "rejects the multi-tab model that most desktop editors assume." As a Markdown author I regularly want several files open side by side in the workflow, but every `Open` discards what I'm viewing, and I cannot compare two files without opening and closing them repeatedly. The single-Document shape also couples the Layout Mode (Split / Preview / Focus) to the whole app: one choice applies to every file, even though I may want to read one file in Preview Only and write another in Split View.

## Solution

The app becomes a multi-Tab workspace, the shape users expect from any desktop editor. Each open Markdown file lives in its own Tab, one Tab per path. A Tab Bar at the top of the window (visible in every Layout Mode) lists all open Tabs with their filename, a Dirty marker, and a per-Tab close control; a `+` creates a new Untitled Tab. The Layout Mode becomes a property of each Document, not of the window: switching Tabs switches the whole window to that Document's mode, and the Layout Switcher and `Ctrl/Cmd+Shift+P` affect only the Active Document. Everything else — Theme, Font, Text Size — stays app-wide. Opening files no longer discards anything: `Open`, drag-drop, and OS file-open add a Tab (or focus the existing one), so the Confirm-Discard Guard now fires only when a Dirty Tab is closed or the window closes with Dirty Tabs open.

## User Stories

1. As a Markdown author, I want multiple Markdown files open at once, so that I can move between them without closing and reopening.
2. As a Markdown author, I want each open file to appear as its own Tab in a Tab Bar, so that I can see everything I have open and switch at a glance.
3. As a Markdown author, I want exactly one Tab per file path, so that the same file is never edited from two places.
4. As a Markdown author, I want opening a file that is already open to focus its existing Tab instead of duplicating it, so that I never lose my place or get confused by duplicate Tabs.
5. As a Markdown author, I want `Open` to add a new Tab rather than replace my current one, so that nothing I'm viewing is discarded by opening.
6. As a Markdown author, I want `New` to create an Untitled Tab without a confirm prompt, so that a quick `New` never interrupts me with a Save dialog.
7. As a Markdown author, I want a new Tab to appear right after the active Tab and become active, so that new work appears adjacent to what I was doing.
8. As a Markdown author, I want the app to start with a single Untitled Tab in Split View, so that the first-launch experience is unchanged.
9. As a Markdown author, I want the Tab Bar at the top of the window in every Layout Mode, so that I can switch files even while reading in Preview Only.
10. As a Markdown author, I want each Tab to show its Document's filename, so that I can identify a Tab.
11. As a Markdown author, I want a Tab to show a Dirty marker when its Document has unsaved changes, so that I can see at a glance which files need saving.
12. As a Markdown author, I want Tabs with the same basename from different folders to also show their parent folder, so that I can tell them apart.
13. As a Markdown author, I want to activate a Tab by clicking it, so that switching is a single click.
14. As a Markdown author, I want each Tab to have its own close control, so that I can close exactly the file I mean.
15. As a Markdown author, I want a `+` affordance at the end of the Tab Bar that creates a new Untitled Tab, so that I can start a file with the mouse.
16. As a Markdown author, I want Tabs to keep their insertion order, so that I can predict where a Tab will be.
17. As a Markdown author, I want switching Tabs to show that Document's content in the window, so that I am always looking at the file I chose.
18. As a Markdown author, I want each Tab to keep its own Layout Mode, so that a file I like reading in Preview Only stays in Preview Only even after I visit another file.
19. As a Markdown author, I want the Layout Switcher to change only the Active Document's mode, so that my other files' layouts are untouched.
20. As a Markdown author, I want `Ctrl/Cmd+Shift+P` to cycle the Active Document's modes only, so that the shortcut affects just the file I am in.
21. As a Markdown author, I want a newly `Open`ed Tab to start in Preview Only, so that reading is the default for existing files as today.
22. As a Markdown author, I want a new Untitled Tab to start in Split View, so that writing is the default for new files as today.
23. As a Markdown author, I want each Tab to remember its cursor, scroll, and undo history while I am away, so that I return to exactly where I left off.
24. As a Markdown author, I want the Preview Pane to render the Active Document only, so that hidden Tabs do not waste work on background rendering.
25. As a Markdown author, I want the window title to reflect the Active Document's filename and Dirty state, so that the OS title always matches what I am viewing.
26. As a Markdown author, I want Theme, Font, and Text Size to apply to every Tab, so that my appearance preferences are consistent across files.
27. As a Markdown author, I want closing a Dirty Tab to show the Confirm-Discard Guard, so that unsaved work is never silently lost.
28. As a Markdown author, I want Cancel in the Guard to keep the Tab open, so that I can change my mind.
29. As a Markdown author, I want closing the Active Tab to activate the Tab to its right (or the new last Tab), so that I land somewhere predictable.
30. As a Markdown author, I want closing the last Tab to close the window, so that the app never lingers with nothing to show.
31. As a Markdown author, I want closing the window with several Dirty Tabs to prompt me once per Dirty Tab, so that every unsaved file gets a chance to be saved.
32. As a Markdown author, I want Cancel on any app-close Guard to abort the close, so that one refusal keeps the whole window alive.
33. As a Markdown author, I want `Open`, drag-drop, and OS file-open to never show the Guard, so that nothing is discarded by opening more files.
34. As a Markdown author, I want Save to write only the Active Document, so that I control exactly which file is written.
35. As a Markdown author, I want Save As to give an Untitled Document a path and update its Tab label, so that the Tab reflects the new name.
36. As a Markdown author, I want an Untitled Tab's Save to behave as Save As until it has a path, so that untitled files never get written somewhere accidental.
37. As a Markdown author, I want multiple Untitled Tabs numbered `Untitled.md`, `Untitled 2.md`, and so on, so that each is distinguishable.
38. As a Markdown author, I want Save As onto a path already open in another Tab to be refused with a message, so that the one-Tab-per-path rule is never broken.
39. As a Markdown author, I want the Active Document checked for external changes on window focus and when I switch to its Tab, so that I see the latest version of the file I am working in.
40. As a Markdown author, I want background Tabs checked only when activated, so that I am not bombarded with dialogs for files I am not looking at.
41. As a Markdown author, I want Find & Replace to operate on the Active Document, so that a search is scoped to the file I am viewing.
42. As a Markdown author, I want each Tab to remember its own Find & Replace state, so that my search in one file is not clobbered by another.
43. As a Markdown author, I want `Ctrl/Cmd+T` to create a new Tab, so that I can start a file without the mouse.
44. As a Markdown author, I want `Ctrl/Cmd+W` to close the Active Tab, so that I can close a file without the mouse.
45. As a Markdown author, I want `Ctrl+Tab` and `Ctrl+Shift+Tab` to cycle through Tabs, so that I can hop between files by keyboard.
46. As a Markdown author, I want the new Tab shortcuts listed in the Shortcuts Reference, so that I can discover them.

## Implementation Decisions

- **Workspace store rework.** The single-Document store becomes a tabs store that owns an ordered list of Tab records plus the Active Tab index. Each Tab record holds that Document's content, canonical path, saved/disk baselines, its Layout Mode, and its Find & Replace state. Active-Document-scoped actions (mirror content, save, save as, reload, external-modification check) mirror the current Document API so existing consumers change minimally.
- **Per-Document Layout Mode.** `layoutMode` moves out of the app-wide UI store into the per-Tab record. The auto-choice happens when a Tab is created (Open → Preview Only, New → Split View). The Layout Switcher and `Ctrl/Cmd+Shift+P` mutate the Active Tab's mode only; the window renders the Active Tab's mode. The split-pane divider position stays app-wide.
- **One mounted editor, state swap.** The editor pane keeps a single mounted CodeMirror instance. Switching Tabs swaps in the Tab's preserved editor state — cursor and undo history travel with the editor state — and restores the saved scroll position. New/Open/reload keep the existing destructive rebuild that clears undo history. The editor-authoritative rule (the store never writes back into the editor) is unchanged.
- **Cold preview.** The Preview Pane renders only the Active Document's content, re-rendering (debounced) when that Tab becomes Active. The `asset://` scope follows the Active Document's directory, updated on Tab switch and on path change; hidden Tabs resolve no images until activated.
- **Tab Bar component.** A new chrome component renders the Tab list: filename label (parent folder appended when two open Documents share a basename), Dirty marker, per-Tab close control, and a `+` New affordance. Clicking a Tab activates it; Tabs stay in insertion order.
- **Open flow.** `Open`, drag-drop, OS file-open, and second-instance forwarded files all add a Tab — or, when the path is already open, focus the existing Tab. None of these run the Confirm-Discard Guard.
- **Close flow.** Close Tab runs the Confirm-Discard Guard when the Document is Dirty; Cancel keeps the Tab. Closing the Active Tab activates the Tab to its right, or the new last Tab. Closing the last Tab closes the window. App close with several Dirty Tabs runs the Guard once per Dirty Tab, sequentially, and Cancel on any aborts the close.
- **Untitled numbering.** A per-session counter names Untitled Documents `Untitled.md`, `Untitled 2.md`, …; the number is never reused within a session.
- **Save As collision.** A Save As target whose path is already open in another Tab is refused with a toast, preserving the one-Tab-per-path invariant.
- **External-modification.** The Active Tab is checked on window focus and on Tab activation; background Tabs are checked only when they become Active.
- **Find & Replace.** The panel operates on the Active Document; each Tab keeps its own query and current-match state, swapped in on Tab switch.
- **Shortcuts.** `Ctrl/Cmd+T` New Tab, `Ctrl/Cmd+W` Close Tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` next/previous Tab are added to the single shortcut registry and the Shortcuts Reference. `Ctrl/Cmd+Shift+P` keeps cycling the Active Document's modes.
- **Window title.** The title derives from the Active Document's filename and Dirty marker (same format as today).

## Testing Decisions

- **What makes a good test here:** assert external behavior only — which Tab Bar elements are rendered and their labels/markers, which Document is Active after a switch (visible content, window title, Layout Mode), the outcome of each Guard choice, Tab add/focus/close rules, Untitled numbering, and the Save As collision toast. Avoid asserting store wiring, method call order, or state-snapshot plumbing.
- **Primary seam — store spec (new model coverage).** A new store-level spec for the workspace model, plus reworked coverage for the re-scoped Document operations. Covers the invariants: Tab add/activate/close, one-Tab-per-path focus, Untitled numbering, Save As collision, the Guard trigger set (never on New/Open; once per Dirty Tab on app close; closing the last Tab closes the window), external-modification triggers (window focus + Tab activation), and per-Tab Layout Mode and Find state. Prior art: the existing document store spec's Dirty/title/save assertions.
- **App-integration seam (highest seam).** Extend the existing full-app integration spec, which mounts the real app with mocked dialogs and window events. Because only the Active Tab's editor mounts (cold rendering + single CodeMirror instance), the existing mount-the-app pattern stays cheap. Covers: Tab Bar render and its visibility across the three Layout Modes; switching by click and by shortcut swapping content, title, and mode; New/Open via keydown adding Tabs; one-Tab-per-path focusing; Guard on close with each mocked choice; per-Tab Find state; the Layout Switcher acting per-Tab; the Save As collision toast; and the three new shortcuts. Prior art: the same file's existing keydown-driven New/Open/Save/Find/layout tests.
- **e2e seam (thin smoke).** One new spec for OS-facing behavior: the window title follows the Active Tab, an OS file-open of a new path adds a Tab, and an OS file-open of an already-open path focuses its Tab. Prior art: the existing one-spec-per-feature e2e suites.

## Out of Scope

- Drag-to-reorder Tabs (insertion order stays fixed).
- Restoring the previous session at launch, or persisting open Tabs or Layout Modes across launches.
- Warm background rendering of hidden Tabs.
- Duplicate Tabs for the same path (forbidden by design).
- Tab chrome polish beyond the close control and `+` affordance (e.g. middle-click-to-close, tab context menus, tab overflow compress/scroll controls).
- Multi-window document editing.
- A combined "Save All" app-close dialog (the sequential per-Dirty-Tab Guard stays).
- Per-Tab split-pane divider position (stays app-wide).
- A maximum Tab count.
- Duplicating or cloning a Tab.

## Further Notes

- ADR-0005 supersedes ADR-0003; the domain glossary already reflects the multi-Tab vocabulary — **Document**, **Tab**, **Tab Bar**, **Active Document**, **Close Tab**, and **Find & Replace** are defined (or redefined) in the context document.
- Shortcut conflict check: `Ctrl/Cmd+T`, `Ctrl/Cmd+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab` are unclaimed by the current shortcut registry and by CodeMirror's default keymap. On Windows `Ctrl/Cmd+W` becomes Close Tab rather than close-window, because the app owns its keybindings; the OS window chrome still closes the app.
- The destructive editor rebuild (which clears undo history) is preserved for New/Open/reload; only Tab switching uses the state-preserving swap.
- The editor stays authoritative: per-Tab content mirrors from the editor exactly as today.
- Only the Active Document's `asset://` scope is set, so background Tabs resolve images only when activated — a consequence of cold preview.
