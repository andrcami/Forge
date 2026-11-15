---
name: harvest
description: Fold a finished branch's lessons back into the owning skill, and portable ones into the shared library. Use before opening any PR.
---

# Harvest

Run **before the PR opens**. One pass, folding what this branch taught back into
the skills so the next session starts ahead.

Diff the branch's work and the `docs/context/status.md` deltas against the
relevant skills. For each candidate lesson, four questions in order:

## 1. Is it durable and general?

Would it bite the next unrelated feature? If it is one-off branch trivia, stop —
writing it costs more than it saves.

A recorded gap that is not fixed yet belongs in `status.md`, not a skill. Skills
hold standing rules, not open TODOs.

## 2. Which skill owns it?

A DB gotcha to `database`, a router constraint to `frontend`, an orchestration
pattern to `gitflow`. Add a terse line with a one-clause source (`PR #22`).

## 3. Is it portable, or project-specific?

- **Project** — stays in this repo's `.claude/skills/<owner>/SKILL.md` under
  `## Lessons`. Schema details, design tokens, this product's rules.
- **Portable** — becomes a library candidate. Provider behavior, language
  semantics, tooling traps, security patterns.

Ambiguous defaults to **project**.

## 4. Prune in the same pass

Remove skill lines describing a state that has since closed. A stale line is
worse than no line.

## How to write it

Everything this pass writes or proposes follows Simplified Technical English:
library lessons, `## Lessons` lines, and the candidate list you show for
approval. Read `references/writing/ste.md` before you write. In short: the rule
comes first and starts with a command verb; rules have 20 words or fewer,
evidence sentences 25; active voice; one name for one thing.

This applies to the written text only. Talk to the user in whatever style the
session uses (terse or caveman mode is fine); quote lesson text unchanged.

## Writing to the library

Portable candidates are **shown for approval before write, never written
silently**. For each: the lesson text, proposed tags (including the `skill:` tag
that routes it), and proposed status.

A new lesson enters `observed`. If it matches an existing lesson's id, the write
appends evidence and any new tags. When that evidence spans two projects, it
promotes the lesson to `confirmed`: a sighting in a second, independent project
is what earns rule status. Two PRs in one project add evidence but do not promote.

Before you propose a lesson, look for one that already says it — a match is
found by meaning, not by id, so search with the rule's key words:

- `forge lessons search <key words>` ranks lessons by the words they share.
  Read the top hits. If one states the same rule, **reuse its id** so the write
  becomes a second sighting, and say "this confirms <id>". An id that was merged
  into another lesson still works: the write lands on the merged lesson.
- If a top hit is `retired`, show it with its reason. The library already
  learned that this rule did not hold; propose it again only with new evidence
  that answers that reason.
- `forge lessons tags` lists the tags in use, with counts. Reuse an existing
  tag value before you make a new one (`stack:typescript`, not a new `stack:ts`).
  A lesson behind an unknown spelling of a tag is a lesson no one loads.

Before you propose a library lesson, write it to a temp file and run
`forge lessons check <file>`. Fix any style warning, then show it. On approval,
run `forge lessons write <file>` (the `store` skill has the file format and where
the CLI is). Report the CLI's
output line — `added`, `promoted`, or `updated` — and stop on a non-zero exit:
an unpushed lesson is the one failure the store exists to prevent.

Report only what the CLI printed. If a command was refused, failed, or did not
run, say that the lesson was **not** written. Never report a write you did not
see confirmed.

## Checkpoints

Hooks also ask for a short harvest on their own: every few turns, before a
commit, after a compaction, and — as this full pass — before a pull request
(`lessonCheckpoints` in the Forge config sets which). Treat each as this pass
over the work since the last checkpoint: same four questions, same approval
before any write. When nothing qualifies, carry on without mentioning it — a
checkpoint that always talks gets ignored.

## Rules

- Harvest runs before the PR, not after. A lesson deferred is a lesson lost.
- Never write a library lesson the user has not seen.
- The library is not a diary. If you cannot state the lesson as a rule someone
  could follow, it is not ready to be written.
