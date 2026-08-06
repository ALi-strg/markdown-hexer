# Slice 19 — BOM / UTF-8 encoding

**Type:** AFK
**Blocked by:** Slices 07, 09

## Source

docs/PRD.md — User story 50; Implementation Decisions (Encoding)

## What to build

All file I/O is UTF-8. Reading strips a leading BOM so Notepad-era files render correctly; writing produces clean UTF-8 without a BOM. A non-UTF-8 file surfaces the error surface (toast) rather than being mangled — the Document stays Dirty and the user knows the read failed.

## Acceptance criteria

- [ ] A file with a leading BOM is read and rendered correctly (BOM stripped)
- [ ] Saved files are UTF-8 without a BOM
- [ ] Opening a non-UTF-8 file surfaces a toast and does not silently corrupt content
- [ ] Rust unit tests for BOM strip and BOM-less UTF-8 write
- [ ] E2E: open a BOM-prefixed file, verify content, save, verify no BOM

## Blocked by

- [Slice 07 — Save / Save As](07-save-save-as.md)
- [Slice 09 — New & Open flows](09-new-open-flows.md)
