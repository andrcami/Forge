---
name: build
description: Phase 4 of Forge — scaffold the project repo, generate its concern skills from the architecture and design decisions, and hand off to implementation planning. Use after architecture (and design, when UI is in scope) is approved.
---

# Phase 4 — Build

> **Paths.** `references/…` below lives in the Forge plugin, not in this project:
> it is `../../references/…` from this skill's base directory. Every other path
> (`docs/…`, `DESIGN.md`, `.claude/…`) is in the project being worked on. When a
> generated file links a Forge reference, write the resolved absolute path.

Scaffold the repo and generate the skills that will govern it. No application
code is written here. There are two exceptions when UI is in scope: the design
tokens file, and a placeholder entry page — the project name on the page ground,
styled only by the tokens — so the e2e smoke spec has something real to load and
the harness can be proven before the first feature exists.

## Before starting

Read `docs/forge/state.json`. **Refuse to run** if the scope is unapproved, or if
the architecture is unapproved and the class is not `throwaway`, or if UI is in
scope (`hasUI`) and the design is unapproved. An open escalation blocks everything.

Read `docs/forge/architecture.md` — it decides which skills exist. When UI is in
scope, read `DESIGN.md` — it decides what the design-system skill says.

## Which concern skills to generate

An output of the architecture decision, not a fixed list.

| Concern skill | Generated when | Wire when present |
|---|---|---|
| `backend` | server-side code exists | — |
| `database` | a persistent store was chosen | — |
| `frontend` | UI is in scope | `ui-ux-pro-max` (stack guidelines), `design-motion-principles` |
| `<design-system>` | UI is in scope | the visual lead(s) named in `DESIGN.md`, `design-motion-principles`, `frontend-design` |
| `qa` | class is not `throwaway` | `superpowers:test-driven-development`, `qa-tests`, `engineering:testing-strategy`, `webapp-testing` |
| `devops` | deployed anywhere | — |
| `gitflow` | always | — |
| `context-memory` | always | — |
| domain skills | architecture names bounded contexts | — |

A Go API with no UI gets backend, database, qa, devops, gitflow, context-memory —
and no frontend anything, and a `qa` skill with no e2e or UI/UX section. Generate the design-system skill even when thin: it owns
tokens, component inventory, and the visual rules that drift without a file to
hold them.

`frontend` and `<design-system>` are separate files because they change for
different reasons: one when the stack or data flow changes, the other when the
look does.

`dataviz` and niche skills stay opt-in — suggest them when the scope mentions
charts or analytics, do not wire them by default.

## Generating a skill

From `references/templates/skill.md`. Each generated skill contains:

- The binding architecture decisions it enforces
- Its boundaries and contracts
- The exact commands for this stack
- A **link** to the Forge stack reference for generic know-how — never inline it
- An empty `## Lessons` section

Then **load library lessons tagged `skill:<concern>`** —
`forge lessons list --tag skill:<concern> --status confirmed --status observed`,
via the CLI the `store` skill describes — and seed the Lessons section: `confirmed` as rules, `observed` as suggestions marked as such. This is
the point where a new project inherits what every prior project learned.

## Generating the qa skill

From `references/templates/qa-skill.md`. The tests are decided by the scope, not
by the code — there is no code yet, which is the point: the test plan exists
before the first feature does.

- **Layers** — the runner, location, and command for each layer this stack has,
  from the architecture's stack. Check each location is inside its runner's
  include glob
- **Flow-to-test map** — one row per v1 core flow from the scope, each with the
  e2e spec that will cover it, status `planned`. Implementation plans pick their
  tests from this table
- **Binding rules** — one per architecture decision with a failure mode, naming
  the integration test that guards it
- **UI/UX checks**, when UI is in scope — Playwright e2e plus the accessibility,
  keyboard, visual-regression, and reduced-motion checks from
  `references/qa/playwright.md`, at the breakpoints and themes `DESIGN.md` names,
  scaled by size class per `references/qa/testing.md`
- **Before the PR** — the commands, plus the review skills that are present

The `design-system` skill's review gate and the `qa` skill's UI/UX checks are
the same gate seen from two sides: design says what must hold, qa says how it is
tested. Write the checks once, in `qa`, and link to them from the design-system
skill.

## Generating the design-system skill

From `references/templates/design-system-skill.md`, filled from `DESIGN.md`. A
`throwaway` with UI gets the template's accessibility floor and nothing else.

- **Binding rules** — the `DESIGN.md` non-negotiables, the token names (never
  raw values in components), and the motion lens weighting
- **Which skill leads what** — the per-surface leads from `DESIGN.md`, so a later
  session loads the right one instead of whichever it remembers. Name each skill
  by its installed name; when a lead is absent, point to the built-in rules in
  `references/design/skills.md`
- **Review gate** — what runs before a UI PR, from `DESIGN.md`. Wire what is
  present: the motion audit from `design-motion-principles`, the real-browser
  inspector from `taste-skill` for public pages, the UX checklist from
  `ui-ux-pro-max`, `design:accessibility-review`. State the fallback for each
  that is absent
- **Tokens file** — emit the tokens from `DESIGN.md` into the stack's native form
  (CSS variables, a Tailwind theme, a Swift/Kotlin theme) as the single source.
  This is the one piece of UI code the build phase writes, because every later
  component depends on it

Generated `SKILL.md` frontmatter must be valid YAML: quote the `description`
value, since a colon followed by a space inside an unquoted value breaks the
parse and the skill silently fails to load.

Generated content reads normally. Caveman mode applies to conversation, never to
a generated `SKILL.md` or `CLAUDE.md`.

## Scaffolded structure

- `.claude/skills/` — the generated concern skills. Every directory there holds a
  `SKILL.md`; when you merge or drop a planned skill (say, a domain skill folded
  into another), remove its directory too. An empty skill directory reads as a
  skill that failed to generate
- `docs/context/` — `status.md`, `decisions.md` seeded from the architecture doc,
  `README.md`
- `CLAUDE.md` — from `references/templates/claude-md.md`
- `DESIGN.md` — already written by the design phase; link it from `CLAUDE.md`,
  do not copy it
- `docs/forge/commands.json` — the commands `CLAUDE.md` lists, in a form CI and
  tools can run without parsing prose. Each value is one shell command run from
  the repo root; omit a key the project does not have:

  ```json
  { "install": "npm ci", "test": "npm test",
    "integration": "npm run test:integration", "e2e": "npx playwright test",
    "services": "Postgres 16 at DATABASE_URL" }
  ```

  - `test` is required and **passes on a fresh clone with only the stack's
    toolchain installed** — unit tests, and anything that brings its own
    dependencies (an embedded or in-memory store, a container the test starts).
    It is what an agent runs after every change, so it cannot depend on a
    service someone has to start first
  - `integration` holds the layers that need an external service; `services`
    says which, and CI provides them. Omit both when nothing needs a service
  - `e2e` exists exactly when Playwright does

  Proving the harness runs means running these commands — at least `install`
  and `test` here, and the rest wherever the services and a browser exist
- Repo bones — `git init`, the branch model, a CI skeleton for the chosen stack
- Test harness — each layer's runner configured and **proven to run**: one
  trivial passing test per layer, executed, so the first real test lands in a
  harness known to collect it. When UI is in scope: `playwright.config.ts`, the
  auth setup project, one smoke spec that loads the app and runs an axe scan, and
  the pinned Playwright Docker image for visual baselines. CI runs every layer;
  e2e uploads its report and traces on failure

## Optional skill detection

Detect, use when present, degrade when absent. **State which path you took.**

| Skill | Used for | Absent → |
|---|---|---|
| `superpowers` | planning, TDD, verification | terse built-in path |
| `caveman` | interaction token cost | normal prose |
| `context-mode` | reference reading | direct reads |
| `graphify` | codebase navigation, `product` only | omitted from generated CLAUDE.md |
| `ui-ux-pro-max` | app UI, tokens, stack UI rules | built-in rules in `references/design/skills.md` |
| `taste-skill` | public pages, art direction | `ui-ux-pro-max`, then `frontend-design` |
| `design-motion-principles` | motion create + audit | the lens table in `references/design/skills.md` |
| `superpowers:test-driven-development` | test-first implementation | the `qa` skill's layers and map |
| `qa-tests` / `engineering:testing-strategy` | coverage review before PR | the checklist in `references/qa/testing.md` |
| `webapp-testing` or a Playwright MCP server | driving the running app interactively while writing e2e specs | write specs from the flow, run them headless |

Design skills only matter when UI is in scope. Their install commands are in
`references/design/skills.md` — offer them once, do not block on them.

## Handoff

Invoke `superpowers:writing-plans` when present, or a built-in plan path when
absent. Say which. That is the terminal step — do not start implementing.
