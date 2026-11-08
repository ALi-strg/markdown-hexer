# Manual OS checklist

Run this on each release platform before shipping. Mark one column per OS.
Windows 11 is the primary target. Linux Wayland is a hard requirement; X11 is
best-effort. macOS is borrowed-hardware best-effort.

## Associations

- [ ] Install, then double-click a `.md` file in Explorer/Finder/the Linux file
      manager. A window opens with that file as a Tab in Preview.
- [ ] Repeat for `.markdown` and `.mdown`.
- [ ] "Open with" Markdown Hexer from the file manager for each extension.
- [ ] Double-click a file while Markdown Hexer is already running. The existing
      window comes forward and the file opens as a new Tab; no second window or
      second process remains.
- [ ] File names with spaces, Unicode, and a path on another drive open
      correctly.
- [ ] Uninstall removes the association and leaves other apps' associations
      intact (ticket 17 installer check).

## Second instance

- [ ] From a terminal, run `markdown-hexer a.md b.markdown` with the app
      closed. Both files open as Tabs, `b.markdown` is Active.
- [ ] With the app running, run `markdown-hexer c.md` from a terminal. The
      running window is focused and `c.md` opens; the command exits promptly.
- [ ] Repeat with a path that is already open. Its Tab becomes Active without
      duplicating it.
- [ ] Launch with no arguments while running. The running window is focused and
      no new document is created.
- [ ] On Windows, `netstat -ano | findstr markdown-hexer` shows no listening TCP
      port. In Sysinternals Process Explorer the pipe name starts with
      `\\.\pipe\markdown-hexer-2.0-` and its DACL grants only the current user,
      SYSTEM, and Administrators.
- [ ] On Linux, `stat -c '%a %U' "$XDG_RUNTIME_DIR/markdown-hexer-2.0-$(id -u).sock"`
      reports `600` and the current user.
- [ ] Kill the running app with Task Manager/SIGKILL, then launch again. It
      starts normally (a stale Unix socket is reclaimed; a stale pipe name is
      gone with the process).

## Drag and drop

- [ ] Drag one file from the file manager into the window. It opens as a Tab.
- [ ] Drag three files at once. All three open in the drop order; the last is
      Active.
- [ ] Drag a file that is already open. Its Tab becomes Active and no duplicate
      Tab appears.
- [ ] Drop a folder or a non-Markdown file. It is ignored or reported, never
      crashes, and never navigates the preview to a local path.
- [ ] Drag while a document is Dirty. The dropped file opens as a new Tab;
      the dirty document is unchanged and still Active until the drop opens.

## Native dialogs

- [ ] Ctrl/Cmd+O opens the native Open dialog. Keyboard-only: Tab/arrow keys
      select a file, Enter opens it, Esc cancels.
- [ ] Ctrl/Cmd+Shift+S opens Save As with the suggested name selected. Keyboard
      only: type a name, Enter saves, Esc cancels and keeps the document Dirty.
- [ ] Close a Dirty Tab or window. The native Guard dialog offers Save,
      Don't Save, Cancel; Esc and the window close button cancel.
- [ ] Save is attempted first, then the close proceeds only on success. A failed
      write leaves the window open and the document Dirty.
- [ ] With Guard open, trigger Open/Save As again. No second native dialog
      appears; the first dialog remains the only pending one.
- [ ] External-modified dialogs (when a file changes on disk outside the app)
      offer Reload/Overwrite/Cancel, are keyboard-operable, and Esc cancels.
      This path is wired through the native adapter; automated change detection
      is tracked separately.

## Links and local files

- [ ] Click an `https://` link in Preview. It opens in the default browser; the
      app does not navigate away.
- [ ] Click an `http://` link. Same behavior.
- [ ] Click a `mailto:` link. The default mail client opens.
- [ ] A `file:`, `javascript:`, `data:`, or custom-scheme link does nothing and
      shows no OS prompt. Relative/absolute local paths in Markdown do not
      replace the app's content.

## About and title

- [ ] Toolbar About opens the dialog in both Preview and Edit modes.
- [ ] Ctrl+/ (Cmd+/ on macOS) opens About in both modes; Esc closes it.
- [ ] About shows "Markdown Hexer", "Version 2.0.0", the repository link, and
      the Shortcuts Reference. The repository link opens the browser.
- [ ] Window title is `<file> — Markdown Hexer`; it gains ` *` after the file
      name when Dirty and loses it after a successful save.
- [ ] Each Tab's title switches to its own file name when the Tab becomes
      Active.

## macOS open-file event (known limitation)

- [ ] Double-click a `.md` file in Finder while the app is closed. The app
      launches with the file (argv path).
- [ ] Double-click a `.md` file in Finder while the app is running. EXPECTED
      FAILURE today: eframe 0.37 does not surface `Event::Opened`/Apple Events,
      so the existing window is not told about the file. Launch
      `open -a "Markdown Hexer" file.md` from a terminal to test the argv path.
      Ticket 17 or a follow-up must add an eframe/egui-winit patch or an
      `NSAppleEventManager` bridge; do not mark this passing until it does.
