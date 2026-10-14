---
name: design
description: Phase 3 of Forge — set the visual and interaction direction for a project with UI in scope, choose which design skills lead each surface, and write DESIGN.md. Use after architecture is approved and before build, whenever the product has a user-facing interface.
---

# Phase 3 — Design

> **Paths.** `references/…` below lives in the Forge plugin, not in this project:
> it is `../../references/…` from this skill's base directory. Every other path
> (`docs/…`, `DESIGN.md`, `.claude/…`) is in the project being worked on. When a
> generated file links a Forge reference, write the resolved absolute path.

Decide how the product looks, moves, and speaks, and write it down where every
later session will find it. Runs only when the scope puts user-facing UI in scope.
A `throwaway` skips it; an API, CLI, or worker with no UI skips it.

No screens are built here. The output is a decision — `DESIGN.md` — that the
build phase turns into the `design-system` skill.

## Before starting

Read `docs/forge/state.json`. **Refuse to run** if the scope or architecture is
unapproved, if `hasUI` is `false`, or if an escalation is open — say which, and
what would unblock it.

Read `docs/forge/scope.md` — users, core flows, surfaces, and the **brand and
feel** answers. Read `docs/forge/architecture.md` for the frontend stack: it
decides which stack guidelines and motion tooling apply.

## Step 1 — Detect the design skills

Read `references/design/skills.md`. Check which are installed and **state it**:

> Design skills: ui-ux-pro-max ✓, taste-skill ✗, design-motion-principles ✓,
> frontend-design ✓.

If a skill that would lead a surface in scope is missing, offer its install
command once. Do not block on it — the degrade path is real.

## Step 2 — Assign leads per surface

From the scope's surfaces, pick the visual lead for each and the motion lead,
using the table in `references/design/skills.md`. One lead per surface; say why.

When both app and marketing surfaces are in scope, the system and tokens are set
**once**, by the app lead, and the marketing lead art-directs on top of them.
Two token sets is two products.

## Step 3 — Inputs

Ask only what the scope left open, one question at a time:

- **Existing brand** — logo, colours, typefaces that are fixed. Fixed values are
  constraints, not suggestions.
- **Three adjectives** for how it should feel, and one it must **not** feel like.
- **References** — products they like the feel of, and ones they dislike.
- **Real assets** — product screenshots, photography, illustration that actually
  exists. Never plan a look around pictures nobody has.
- **Density and frequency** — how long users stay, how often they repeat the core
  action. This sets the motion lens more than taste does.

## Step 4 — Directions

Produce **three** directions, then lead with a recommendation. Sources, by what
is present:

- **ui-ux-pro-max** — run its design-system generator with the product type,
  industry, and adjectives. Persist only after approval.
- **taste-skill** — for public pages, let it deal directions against an
  inventory of what only this client has. Take its direction sheet as given;
  redraw only for a reason you can state.
- **A DESIGN.md reference** — when there is no brand, pick a reference whose
  *proportions* fit, and change its identity. Follow the rule in
  `references/design/skills.md`; never ship another company's look.
- **Built-in** — when nothing is present, reason the direction from the subject
  and the adjectives.

Each direction states: the idea it is built on, the palette and type, the density,
**where it loses**, and what assets it needs that may not exist.

Load library lessons tagged `skill:design-system` or `skill:frontend` before
recommending — `forge lessons list --any-tag skill:design-system --any-tag skill:frontend`
(the `store` skill says where the CLI is). Say which informed the choice.

## Step 5 — Motion

Set the lens weighting from the project type and the frequency answers — use
design-motion-principles when present, the table in the reference when not.
Record durations, easing, what never animates, and the reduced-motion fallback.

## Step 6 — Decision

Write `DESIGN.md` at the project root from `references/templates/design.md`. It
sits at the root because that is where Claude Design, Stitch, and other design
agents look for it. Record why the winning direction won **and why each loser
lost**.

Append the binding design decisions to `docs/context/decisions.md`.

The review gate names **what** must hold — breakpoints, themes, the
accessibility floor, reduced motion. The build phase's `qa` skill turns it into
Playwright checks; do not specify test code here.

Present it and **ask for explicit approval**. On approval, stamp
`approvals.design` in `state.json`.

Ceremony scales with the size class:

| Class | Directions | Motion | Review gate |
|---|---|---|---|
| `tool` | one, stated with rationale | lens + durations only | accessibility floor |
| `product` | three, with a recommendation | full section | motion audit + accessibility review + real-browser check for public pages |

## Escalation

Stop and send work backward when:

- The brand constraints contradict the scope's users or feel → **scope**
- The chosen frontend stack cannot carry the direction (e.g. server-rendered
  only, but the flows need rich client interaction) → **architecture**
- A required asset does not exist and the direction depends on it → re-draw the
  direction, or **scope** if the asset was promised

Write the escalation to `state.json`, as the architecture phase does.

## Next

`/forge:build`. State that, and stop.
