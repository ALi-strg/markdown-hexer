# 07 — Externally-Modified checks for the Active Tab

**What to build:** The Active Document is checked for external changes on window focus and on Tab activation; background Tabs are only checked when they become Active. The existing Reload / Overwrite / Cancel behavior is unchanged, and clean Documents still reload silently.

**Blocked by:** 02

**Status:** resolved

- [x] The Active Tab is checked on window focus and on Tab activation
- [x] Background Tabs are not checked until they become Active
- [x] A clean Active Tab reloads silently; a Dirty Active Tab gets Reload / Overwrite / Cancel as today

## Comments

The check now runs whenever a Tab becomes Active — Tab Bar click, a neighbour Tab taking over after a close, and re-focusing an already-open path through Open — via a shared `checkActiveTabExternalModification` helper in `App.vue` that window focus also calls. The store's `checkExternalModification` still inspects only the Active Tab, now judging the captured Tab by its own Dirty flag and filename for the whole check, and treating a malformed inspect like an unreadable file (no change). A reload is pushed into the editor only while the checked Tab is still Active.

Verification: `npm test` (377 passing, incl. 4 new App integration tests + 1 store test), `vue-tsc --noEmit`, `cargo test` (33 passing).
