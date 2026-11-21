---
name: architect
description: Phase 2 of Forge — explore stack candidates from the scope's discriminating answers, compare trade-offs, and record the architecture decision. Use after scope is approved, before any implementation.
---

# Phase 2 — Architecture

> **Paths.** `references/…` below lives in the Forge plugin, not in this project:
> it is `../../references/…` from the base directory of this skill. Every other path
> (`docs/…`, `DESIGN.md`, `.claude/…`) is in the project being worked on. When a
> generated file links a Forge reference, write the resolved absolute path.

Runs for `tool` and `product`. A `throwaway` skips this phase entirely.

## Before starting

Read `docs/forge/state.json`. **Refuse to run if the scope is unapproved** or an
escalation is open — say which, and what would unblock it.

Read `docs/forge/scope.md` in full. The non-goals matter as much as the goals.

## Step 1 — Discriminators

Read `references/discriminators.md`. Ask only the questions the scope leaves
open, one at a time. A question whose answer would not change any candidate is a
question worth skipping.

Ask for the scale band **and** the plausible peak separately. The gap between
them is often the design.

## Step 2 — Candidates

Produce **three**, reasoned from the answers first, then checked against
`references/stacks/`. The catalog is evidence, not a verdict — never pick a stack
because it has a file.

Load library lessons before comparing (the `store` skill says where the CLI is):

- the architecture lessons, once —
  `forge lessons list --any-tag 'arch:*' --status confirmed --status observed`
- then, for each candidate, the lessons for its stack —
  `forge lessons list --any-tag 'stack:*' --stack <s> [--stack <s>]... --status confirmed --status observed`,
  one `--stack` per language, framework, and datastore it names. The output
  includes `stack:any` lessons; count them once, not per candidate.

Do not load every `stack:*` lesson in the library: lessons for stacks no
candidate uses are noise. A `confirmed` lesson is a prior project reporting what
actually hurt; an `observed` one is a suggestion. Say which informed a trade-off.

Each candidate states:

- **Fit** — why it suits these answers
- **Where it loses** — the real cost, not a token caveat
- **Failure modes at 10× the stated scale**
- **Team-fluency cost**
- **Ops burden**

In play without prejudice: Go, Elixir/Phoenix, Rust, Django, Rails, .NET,
Java/Spring, SQLite/LiteFS, Postgres, ClickHouse, NATS, Deno, Next.js, and plain
server-rendered anything. **Next.js, Python, and Postgres compete on merit and are
rejected as readily as any other candidate** — a default is not a decision.

Lead with a recommendation and the reasoning. Do not present three options and
ask the user to choose blind.

## Step 3 — Decision

Write `docs/forge/architecture.md` from `references/templates/architecture.md`.
Record why the winner won **and why each loser lost** — the rejection reasons are
what stop the question being reopened every month.

Seed `docs/context/decisions.md` with the binding decisions.

### Draw it

Draw the module boundaries, so the user approves a picture as well as prose.
**State which path you took.**

- **`archify` installed** — ask it for an `architecture` diagram of the
  `## Module boundaries` section: every module, and each contract between them
  as a labelled relationship. Output `docs/forge/architecture.html`, and keep the
  candidate JSON beside it as `docs/forge/architecture.archify.json` so a redraw
  starts from it. Follow Archify's own instructions for the format and commands;
  never write its JSON from memory. Link the HTML from `## Diagram`.
- **Absent, or its checks still fail after its own repair rounds** — a Mermaid
  `flowchart` in `## Diagram`: one node per module, one labelled edge per
  contract. Say why. When Archify is missing, mention once that
  `npx skills@1.9.0 add tt-a1i/archify --skill archify` adds it; do not block on it.

The diagram shows the document and never adds a module or contract the document
lacks. When the architecture changes, redraw it from the new document.

Present it and **ask for explicit approval**. On approval, stamp
`approvals.architecture` in `state.json`.

## Escalation — sending work backward

Any of these stops the phase. Name the conflict out loud; never absorb it
silently.

- The scope contradicts itself — two requirements cannot both hold
- No candidate survives the constraints — budget, scale, and team do not admit a
  stack
- Scale answers imply an architecture the budget or team cannot operate
- A later discovery contradicts a settled architecture decision

On trigger: stop, state the conflict concretely, name the phase that owns it,
propose the smallest change that resolves it, and wait. Write the escalation to
`state.json` so a resumed session sees the project is parked on a conflict rather
than merely unfinished. Use exactly these fields, because every phase reads them:

```json
"escalation": {
  "owner": "scope",
  "from": "architecture",
  "conflict": "<the requirements that cannot all hold, stated concretely>",
  "proposal": "<the smallest change that resolves it>",
  "raised": "<ISO timestamp>"
}
```

`owner` is the phase that must change: `scope`, `architecture`, or `design`.
`from` is the phase that found the conflict. Leave the rest of `state.json` as it
is. The owning phase clears the escalation: once the user approves the change it
proposes, it sets `escalation` to `null`.

A recorded architecture revision is strong lesson material — harvest it.

## Next

- UI in scope (`hasUI: true`) → `/forge:design`
- no UI → `/forge:build`

State which, and stop.
