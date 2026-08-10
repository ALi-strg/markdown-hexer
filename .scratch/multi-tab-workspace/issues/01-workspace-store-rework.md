# 01 — Workspace store rework

**What to build:** The single-Document store becomes a workspace holding an ordered list of Tab records plus an Active index. Each Tab record carries its Document's content, canonical path, saved/disk baselines, Layout Mode, and Find & Replace state. The Active-Document surface the app already uses (content, canonical path, Dirty, filename, title, Save, Save As, New, Open, Externally-Modified check) keeps working against the Active Tab, so launch still presents one Untitled Tab in Split View and New/Open still replace the Active Tab's content. No visible behavior changes — this is the prefactor that makes the later multi-Tab slices land green.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] The store owns an ordered list of Tab records and an Active index; each record holds content, canonical path, saved/disk baselines, Layout Mode, and Find & Replace state
- [x] Every existing Document operation (New, Open, Save, Save As, Externally-Modified check, content mirror) behaves exactly as today, scoped to the Active Tab
- [x] Launch still presents exactly one Untitled Tab in Split View; no visible behavior change anywhere
- [x] Existing unit and app-integration tests pass unchanged
- [x] Store tests cover the new invariants: exactly one Active index, an ordered list, and Active-index bounds on switch

## Comments

Implemented in `7aa5080`: `useDocumentStore` becomes a workspace holding `tabs: Tab[]` plus `activeIndex`, with the Document-shaped surface (content, canonicalPath, dirty, filename, title, save/open/new/external-modification) kept as computeds/actions over the Active Tab so existing consumers and tests were untouched. New-model coverage lives in `src/stores/__tests__/workspace.spec.ts` (Active-index bounds, ordered list, per-record session state). Verified by the full suite green at ticket 02's close (`npm test`, `vue-tsc`, `cargo test`, `test:e2e`).
