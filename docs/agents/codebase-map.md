# Codebase Map

How agents should use this repo's codebase map when navigating the code.

## Before exploring, read these

- **`docs/codebase-map.md`** — the whole-repo map. Read it first when a task lands in unfamiliar territory; it replaces re-exploring the codebase so repeated exploration stops burning tokens.
- **`docs/codebase-map.<area>.md`** — subsystem maps for focused areas. Read the one matching your task when one exists.

If the whole-repo map is **missing** or **stale** (its `Last updated` date is old), don't block: explore normally, then consider running `/codebase-map` to generate or refresh it in place.

## Rules

- The map is a context brief for orientation, not documentation — trust it to point you at the right files, but verify specific facts against the code when correctness matters.
- Prefer the map over re-exploring. If the map is wrong or out of date, refresh it with `/codebase-map` rather than silently working around it.
