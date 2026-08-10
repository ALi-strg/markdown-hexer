# Single-Document model with a confirm-discard guard

**Status: superseded by ADR-0005 (Multi-Tab workspace).**

The app holds exactly one Document in memory at a time; `New`/`Open` replace it, and the Confirm-Discard Guard protects unsaved work. This rejects the multi-tab model that most desktop editors assume. It matches the window-title-as-filename concept, keeps the Pinia state flat, and keeps the MVP tight — but it forecloses side-by-side file comparison without a refactor, and the layout-mode auto-choice (Open → Preview Only, New → Split View) is coupled to this single-document shape.
