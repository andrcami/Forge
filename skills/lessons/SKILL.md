---
name: lessons
description: Read, import, promote, retire, and purge lessons in the Forge library. Use when backfilling lessons from an existing repo, reviewing what the library holds, retiring a lesson that turned out wrong, or clearing project lessons.
---

# Lesson library

The library holds **portable** lessons — those that would bite the next project
regardless of stack, or that are tagged to the stack they apply to. Project-specific
lessons stay in their own repo.

## The two axes

A lesson carries two independent classifications. Conflating them is the mistake
this design exists to avoid.

- **`scope:`** — `project` or `portable`. Decides **where it is stored**.
- **`tags:`** — `stack:go`, `skill:database`, `domain:webhooks`, `platform:windows`.
  Decides **when it loads**.

Every portable lesson carries a `skill:` tag naming the concern skill it belongs
to. That tag is what routes a lesson into the right generated skill in the next
project.

## Load rules

- `confirmed` matching tags load **as rules**
- `observed` load **as suggestions**, flagged as such
- `retired` load only when something proposes re-adding the same lesson, and
  surface as "tried this, did not hold, here is why"

The retired tier is what stops the same wrong idea being relearned. It is the
half of the library that records what does **not** work.

## Commands

### `import <path>`

Read an existing repo's `.claude/skills/**` and propose portable candidates.
For each: show the lesson, the proposed tags, and the proposed status. **Approve
per entry** — nothing is written unseen. A lesson that has demonstrably bitten
twice may enter as `confirmed`; everything else enters `observed`. Write each
approved entry with `forge lessons write <file>`.

Filter out what is not portable: project-specific schema, design tokens, one-off
branch trivia. When unsure, leave it in the project — wrong-but-local beats
wrong-and-global.

### `list [--tag <t>]`

`forge lessons list [--tag <t>]` — the library, `confirmed` first, `retired`
last. The `store` skill has the full CLI and where it lives.

### `retire <id> --reason "<why>"`

`forge lessons retire <id> --reason "<why>"`.

**The preferred operation when a lesson turns out wrong.** The entry stays
visible with its reason, so the next session learns what was tried.

### `purge --project`

Clear `## Lessons` sections in the current repo's skills. The library is
untouched.

### `purge --library --tag <t>`

Tag-scoped library purge. Requires typed confirmation. Prefer `retire` — purging
discards the negative knowledge the library exists to keep. The library is a git
repo, so a purge is recoverable; say so when confirming rather than making it
sound irreversible.

The CLI has no purge command, on purpose. After typed confirmation, list the
matches with `forge lessons list --tag <t>`, then in the store's clone (`forge
store info` shows where) `git rm` exactly those files, commit with a `lessons:
purge <tag>` message, and push. Never stage anything else.

## Rules

- **Nothing is written to the library without the user seeing it.** A library
  that writes itself unattended drifts.
- **Ambiguous scope defaults to `project`.**
- **Prune in the same pass as you write.** A lesson describing a since-closed
  state is worse than no lesson.
