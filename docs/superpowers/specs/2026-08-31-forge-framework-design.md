# Forge — project bootstrap framework with a cross-project lesson library

**Date:** 2026-08-31
**Status:** Design approved, ready for implementation planning
**Repo:** `github.com/andrcami/Forge` (private)

## Problem

A prior project's `.claude/skills/` produced compounding value: each branch
folded its hard-won lessons back into the skill that owned them, so month-three
sessions started ahead of month-one sessions. Two limits:

1. The value is trapped in one repo. A lesson learned there ("verify a
   provider's real auth mechanism against its docs") is stack-agnostic and would
   prevent the same bug anywhere, but no other project can see it.
2. New projects start cold. There is no path from "I have an idea" to "a repo
   with the right skills, the right architecture, and the accumulated lessons of
   every prior project already loaded".

Forge is a Claude Code plugin that drives a new project from scope through
architecture into development, generates the project's skills from the
architecture decision, and accumulates portable lessons in a library shared
across every project it touches.

## Non-goals

- Not a code generator. Forge scaffolds skills, docs, and repo structure; the
  application code is written afterwards through the normal development workflow.
- Not a replacement for `superpowers`. Forge delegates planning, TDD, and
  verification to it where present.
- Not a hosted service. The lesson store is git; no API, no server, no accounts.
- Not stack-opinionated. Next.js/Python/Postgres compete on merit and are
  rejected as readily as any other candidate.

## Decisions settled during design

| # | Decision | Rejected |
|---|---|---|
| D1 | Ship as a Claude Code plugin, not a template repo | Template repo (rots; cannot hold a conversation), plugin+template hybrid |
| D2 | Architecture explores stacks by reasoning from discriminating questions, with a stack catalog consulted as evidence | Catalog-driven selection (picks stack before understanding problem), pure first-principles (drifts run to run, nothing to correct) |
| D3 | Architecture phase generates thin, stack-tailored project skills that link to plugin reference files | Spec-only handoff (lessons have nowhere to land), generic shipped stack skills (training-data restatement) |
| D4 | Lessons carry status + evidence; `observed` → `confirmed` on second sighting; wrong lessons are `retired` with a reason, kept visible | Promote-on-repeat only (drops single-project value), promote-all-tagged (no place to record what failed) |
| D5 | Store interface with local-dir and git-remote backends; adapter seam for a future HTTP/DB backend, designed but unbuilt | Local only, HTTP/DB backend built now (service to run and secure, zero capability gain today) |
| D6 | Hard phase gates, ceremony scaled by project size class; escalation may send work backward | Uniform hard gates (a 200-line tool does not need a stack comparison), soft gates (the instruction models rationalize past) |
| D7 | Detect optional skills, use when present, degrade gracefully when absent | Hard dependency on superpowers, self-contained reimplementation |
| D8 | Lessons live in a `lessons/` subdir of the Forge repo, which **must stay private** | Separate private repo (cleaner separation, extra remote), orphan branch (confusing to operate) |
| D9 | (2026-10) A gated design phase between architecture and build, run only when UI is in scope, writing a root `DESIGN.md`; external design skills (ui-ux-pro-max, taste-skill, design-motion-principles) are detected and assigned one lead per surface | Design folded into build (the direction is a decision needing its own approval, and build writes no UI), vendoring the design skills (they rot inside Forge; D3/D7), stacking every design skill on every surface (they disagree — taste-skill excludes app screens) |
| D10 | (2026-10) Scope widened into the product phase — first release, today's alternative, riskiest assumptions, surfaces, brand and feel — rather than a separate product phase before it | A separate `product` phase (two interviews over the same ground; scope already owns the problem and the non-goals) |
| D11 | (2026-10) Build generates a `qa` concern skill and a proven test harness; the scope's core flows become the e2e map, and UI/UX QA (axe, keyboard, visual regression, reduced motion) runs in Playwright | Leaving tests to the implementation plan (the plan then tests the code it wrote, not the flows the scope promised), a generic shipped QA skill (no flow map, no stack commands), a separate visual-testing tool (Playwright already holds the browser and the flows) |
| D12 | (2026-10) Supersedes D8: the lesson library moves to its own private repo per context (personal, each employer). Forge reads and writes it only through the `forge` CLI, and `/forge:setup` connects or creates it (`gh`, private, after confirmation). Plugin settings pre-fill setup; `~/.claude/forge/config.json` stays the one source of truth | Lessons inside the Forge repo (a fork or merge between contexts carries the library with it), creating the repo from a session-start hook (an outward action without consent), plugin settings as the source of truth (the CLI must work outside Claude Code) |

**D8 depends on repo visibility** *(superseded by D12)*. The repo was created public and switched to
private on 2026-08-31 before any lesson was written. Lessons name real auth
findings, provider quirks, and past security gaps — publishing them is a
disclosure, and making a repo private afterwards does not retract what was
already pushed. If Forge is ever to be published, lessons must move to a separate
private repo first (see the exit path under *Store interface*), not be excised
after the fact.

## Architecture

### Plugin layout

```
Forge/
├── .claude-plugin/plugin.json
├── commands/
│   ├── scope.md            → forge-scope
│   ├── architect.md        → forge-architect
│   ├── build.md            → forge-build
│   ├── harvest.md          → forge-harvest
│   └── lessons.md          → forge-lessons
├── skills/
│   ├── forge-scope/        phase 1 — interview → scope.md + size class
│   ├── forge-architect/    phase 2 — discriminators → candidates → decision
│   ├── forge-build/        phase 3 — scaffold repo, generate skills
│   ├── forge-lessons/      library read/write/promote/retire/import/purge
│   ├── forge-harvest/      end-of-branch lesson capture
│   └── forge-store/        store interface — local · git · adapter seam
├── references/
│   ├── stacks/             one file per archetype
│   ├── discriminators.md   the questions that separate stacks
│   └── templates/          generated SKILL.md + docs scaffolds
```

The lesson library is not in this repository: each context keeps its own private
lesson repo (D12).

Phase skills are thin drivers. Substance lives in `references/`, so correcting an
aging stack opinion is a reference edit, not a skill rewrite.

### Gate state

`docs/forge/state.json` in the target project records the current phase, size
class, approvals, and any active escalation. Phase skills read it and refuse to
run when a prerequisite is unapproved. State is a file, not conversation memory —
it survives `/clear` and session end.

```json
{
  "phase": "architecture",
  "sizeClass": "product",
  "approvals": { "scope": "2026-08-31T10:22:00Z", "architecture": null },
  "escalation": null
}
```

An active escalation records the conflict, the phase that owns it, and the
proposed resolution, so a resumed session sees the project is parked mid-conflict
rather than mid-progress.

## Phase 1 — Scope

`/forge:scope`, run in an empty or existing directory. Interview one question at a
time, multiple-choice where the option set is closed.

Output `docs/forge/scope.md`: problem, users, core flows, **explicit non-goals**,
success criteria, constraints (budget, team size, deadline, compliance, systems
that must be integrated).

Non-goals are load-bearing, not decoration. They are what the architecture phase
uses to reject candidates that win only on capabilities the project does not want.

### Size classification

Proposed by the skill from the interview, confirmed by the user. This is the
ceremony dial for every later phase.

| Class | Means | Architecture phase | QA gates |
|---|---|---|---|
| `throwaway` | script, spike, one-off | skipped | none |
| `tool` | single-purpose, one or few users | short — stack named + rationale, no comparison | typecheck + test + build |
| `product` | multi-user, real data, will live | full — discriminators, 3 candidates, decision doc | full gate list + review agents |

## Phase 2 — Architecture

Runs for `tool` and `product`. Three steps.

### Discriminators

Questions chosen to separate stacks, not to fill a form. The skill asks only
those the scope leaves open:

- Concurrency shape — request/response, long-lived connections, fan-out
- Latency budget, and whether it is a floor or an average
- Data model — relational, document, graph, time-series, blob-heavy
- Realtime requirements
- Expected scale band, and **separately** the plausible peak
- Team size and existing language fluency
- Regulated or PII data
- Offline or mobile clients
- ML in the request path
- Deploy constraints — VPS, serverless, on-prem, air-gapped

### Candidates

Three, reasoned from the answers, then checked against `references/stacks/`. Each
candidate states: where it fits, **where it loses**, failure modes at 10× the
stated scale, team-fluency cost, ops burden.

Library lessons tagged `stack:*` or `arch:*` with status `confirmed` load here.
That is a prior project reporting what actually hurt.

In play without prejudice: Go, Elixir/Phoenix, Rust, Django, Rails, .NET,
Java/Spring, SQLite/LiteFS, Postgres, ClickHouse, NATS, Deno, Next.js, plain
server-rendered anything.

Each `references/stacks/*.md` states fit, anti-fit, failure modes, and scale band.
A catalog of features is marketing; a catalog of failure modes is useful.

### Decision

`docs/forge/architecture.md` — chosen stack and why, rejected candidates with the
reason each lost, module boundaries, data model sketch, and the decisions that
become binding rules in the generated skills. Seeds `docs/context/decisions.md`.

### Escalation — backward movement

Any phase may send work backward. Triggers are named out loud, never silently
absorbed:

- The scope contradicts itself — two requirements cannot both hold
- No candidate survives the constraints — budget, scale, and team do not admit a stack
- Scale answers imply an architecture the budget or team cannot operate
- A build-phase discovery contradicts a settled architecture decision

On trigger: stop, state the conflict concretely, name the phase that owns it,
propose the smallest scope or architecture change that resolves it, and wait. The
escalation is written to `state.json` with its reason. A recorded architecture
revision is itself strong lesson material.

## Phase 3 — Build

### Generated concern skills

Which skills exist is an output of the architecture decision, not a fixed list.

| Concern skill | Generated when | External skill wired when present |
|---|---|---|
| `backend` | server-side code exists | — |
| `database` | a persistent store was chosen | — |
| `frontend` | UI is in scope | — |
| `<design-system>` | UI is in scope | `frontend-design` |
| `devops` | deployed anywhere | — |
| `gitflow` | always | — |
| `context-memory` | always | — |
| domain skills | architecture names bounded contexts | — |

The engineering skill and the visual-system skill are separate files because they
change for different reasons — the source project's `frontend` + design-system
skill pair is the precedent. The design-system skill is generated even when thin: it owns tokens,
component inventory, and non-negotiable visual rules, which drift without a file
to hold them.

`dataviz` and genuinely niche skills stay opt-in, surfaced as a suggestion when
scope mentions charts or analytics.

Each generated skill contains: the binding architecture decisions it enforces,
module boundaries, the commands for this stack, and an empty `## Lessons` section
the harvest step fills. Generic stack know-how is **linked** to the plugin's
reference files, never inlined.

### Scaffolded structure

- `.claude/skills/` — the generated concern skills above
- `docs/context/` — `status.md`, `decisions.md` (seeded from the architecture
  doc), `README.md`
- `CLAUDE.md` — session-start protocol, skills index, authority order, commands,
  non-negotiables carried from architecture
- Repo bones — `git init`, branch model, CI skeleton for the chosen stack, test
  setup

### QA and PR gates

Written into the generated `gitflow` skill, stack-adapted, scaled by size class:

- Pre-PR local: typecheck, build, tests green (commands filled per stack)
- **Harvest runs before the PR opens** — see Phase 4
- Docs sweep: user-facing docs, spec-vs-implementation drift, contradictions with
  binding decisions. PR body names what was updated or states "no doc impact"
- Memory update ships in the same PR as the work it describes
- Branch model, PR base rules, branch deletion after merge
- CI skeleton so the gates run in CI, not only locally
- `product` class additionally runs review agents (`code-review`,
  `pr-review-toolkit`) when present

### Handoff

Invokes `superpowers:writing-plans` when present, or a built-in plan path when
absent, stating which it took.

## Phase 4 — Lessons and harvest

### The two-axis model

A lesson carries two independent classifications. Conflating them was the design's
main correction.

- **`scope:`** — `project` or `portable`. Decides **where it is stored**.
- **`tags:`** — `stack:go`, `domain:webhooks`, `skill:database`,
  `platform:windows`. Decides **when it loads**.

`scope:project` lessons live in that repo's `.claude/skills/*/SKILL.md` under
`## Lessons` and never enter the library. `scope:portable` lessons go to the
library and always carry a `skill:` tag naming the concern skill they belong to —
that tag is what routes a lesson into the right generated skill in the next
project.

Classification is proposed at harvest and confirmed by the user. Ambiguous cases
default to `project`: wrong-but-local beats wrong-and-global.

### Three tiers

| Tier | Lives | Holds | Synced by |
|---|---|---|---|
| Framework | `Forge/` | plugin code, phase skills, references, templates | git |
| Project | each repo's `.claude/skills/` + `docs/context/` | `scope:project` lessons, decisions, status | that repo |
| Portable | a private lesson repo per context (D12) | `scope:portable` lessons | git remote |

Portable lessons live outside any single project, which is precisely what makes
cross-project learning work: a lesson written in one project is pulled by the next
project without either repo knowing about the other.

### Lesson format

One markdown file per lesson.

```markdown
---
id: example-provider-auth-check
scope: portable
status: confirmed          # observed | confirmed | retired
tags: [stack:any, skill:backend, domain:webhooks]
evidence:
  - project: example-project
    ref: "PR #12"
    date: 2026-07-20
retired_reason: null
---
Verify a provider's real auth mechanism against its docs before writing the
handler. A signature check for a header the provider never sends rejects all
production traffic while the test suite stays green.
```

### Store interface

`forge-store` exposes four operations — `list(tags)`, `read(id)`,
`write(lesson)`, `retire(id, reason)` — over three backends:

- **local** — a plain directory
- **git** — pull before read, commit + push after write (D12: a private lesson
  repository of its own)
- **adapter seam** — interface defined for a future HTTP/DB backend, not built

```json
{ "store": { "backend": "git",
             "path": "~/dev/forge-lessons",
             "remote": "git@github.com:<owner>/forge-lessons.git",
             "subdir": "lessons" } }
```

Lesson commits are prefixed `lessons:` so `git log -- lessons/` reads clean.

**Exit path, taken (D12).** Lessons moved to their own private repository through
`/forge:setup --import`. Forge was then published from a fresh repository rather
than by excising lessons from this one's history — which, as D8 warned, does not
retract what was already pushed.

### Lifecycle

- New lesson enters `observed`
- Second independent sighting → `confirmed`, evidence appended
- Found wrong or stale → `retired` with a reason, kept visible

### Load rules

- `confirmed` matching tags load **as rules**
- `observed` load **as suggestions**, flagged as such
- `retired` load only when something proposes re-adding the same lesson, and
  surface as "tried this, did not hold, here is why"

The retired tier is the "what does not work" half of the requirement. It is what
stops the same wrong idea being relearned.

### Harvest

`forge-harvest`, run **before the PR opens** — the slot the source project's
gitflow skill already proves works.

Diff the branch's work and the `status.md` deltas against the skills. For each
lesson:

1. Durable and general, or one-off branch trivia? Only the former is written.
2. Owning skill? A DB gotcha to `database`, a router constraint to `frontend`.
3. Portable, or project-specific? Portable becomes a library candidate.
4. Prune stale project-skill lines in the same pass — a line describing a
   since-closed state is worse than no line.

Library candidates are **shown for approval before write, never written
silently**. A library that writes itself unattended drifts.

### Commands

- `/forge:lessons import <path>` — read an existing repo's skills, propose
  portable candidates with tags and status, approve per entry. Backfilled entries
  land `observed` unless explicitly marked `confirmed`.
- `/forge:lessons purge --project` — clear `## Lessons` sections in the current
  repo. Library untouched.
- `/forge:lessons purge --library --tag <t>` — tag-scoped library purge, typed
  confirmation required.
- `/forge:lessons retire <id> --reason "<why>"` — the preferred operation.
  Purging the library discards the negative knowledge the design exists to keep.

The library is a git repo, so even a purge is recoverable. The skill says so, to
keep the confirmation honest rather than theatrical.

### Initial backfill

The first import came from the skills of the project Forge grew out of: eight
portable lessons spanning provider auth, test configuration, agent review, git
workflow, and authorization. They live in the private lesson library, not here.
Project-specific rules — payment flows, design tokens, concurrency rules — stayed
in that project.

## Optional skill detection

Detect, use when present, degrade gracefully when absent — never require. The
phase skill states which path it took.

| Skill | Used for | Absent → |
|---|---|---|
| `superpowers` | planning, TDD, verification | terse built-in path |
| `caveman` | interaction token cost | normal prose |
| `context-mode` | architecture-phase reference reading | direct reads |
| `graphify` | codebase navigation, `product` class only | omitted from generated CLAUDE.md |

`caveman` is scoped: **off** for generated `SKILL.md` / `CLAUDE.md` content and
commit messages, **on** for interaction. The framework is interview-heavy and
generates a lot of prose, so the saving is real, but generated artifacts must read
normally.

## Testing

- **Store** — unit tests per backend against a temp dir and a temp git remote:
  round-trip write/read, tag filtering, `observed` → `confirmed` promotion,
  retire preserves the entry, purge scoping (project purge leaves library intact).
- **Lesson format** — frontmatter schema validation; a malformed lesson is
  rejected at write, not at load.
- **Phase gates** — a phase skill invoked with an unapproved prerequisite refuses;
  `state.json` survives a simulated session restart.
- **Generation** — for two contrasting architectures (Go API without UI; a
  full-stack app with UI), assert the correct concern-skill set is generated and
  that library lessons route to the right skill by `skill:` tag.
- **End-to-end** — a `throwaway` and a `product` run through all phases, asserting
  ceremony scales as specified.

**Coverage status (2026-08-31).** The first three categories are covered by the
automated suite. **Generation and End-to-end are not** — both exercise
LLM-driven skill prose rather than code, and the branch carries no harness for
that. Lesson routing by `skill:` tag and the gate's refusals (including an open
escalation blocking all three phases) were verified manually, once, at the end
of the initial build; nothing protects them from regression. Treat this section
as describing intent, not achieved coverage, until a prose-level harness exists.

## Build order

Full build, in dependency order:

1. `forge-store` + lesson format — everything else depends on it
2. `forge-lessons` including `import`, and the initial backfill
3. `forge-harvest`
4. `forge-scope`
5. `forge-architect` + `references/stacks/` + `discriminators.md`
6. `forge-build` + `references/templates/`

Steps 1–3 are independently useful the moment they land: installed into an existing project,
they start accumulating lessons before the phase skills exist. Steps 4–6 then open
with a populated library rather than an empty one.

## Open risks

- **Stack catalog ages.** Mitigated by keeping it evidence rather than verdict,
  and by making it a reference file edit.
- **Library bloat.** Mitigated by the harvest gate (durable + general + portable),
  the approval-before-write rule, and pruning in the same pass.
- **Retire path going unused.** A library where nothing is ever retired is lying
  by month six. Mitigated by `observed` loading as suggestion rather than rule, so
  a wrong entry costs a moment's thought, not a bad architecture.
- **Single-repo coupling (D8).** Resolved by D12: lessons live in their own
  private repositories, and Forge was published from a fresh repository.
