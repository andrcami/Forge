---
name: scope
description: Phase 1 of Forge — the product phase. Interview the user to pin down the problem, users, the first release, and the riskiest assumptions; classify project size; and write the scope document. Use at the start of a new project, before any architecture, design, or implementation work.
---

# Phase 1 — Scope

> **Paths.** `references/…` below lives in the Forge plugin, not in this project:
> it is `../../references/…` from this skill's base directory. Every other path
> (`docs/…`, `DESIGN.md`, `.claude/…`) is in the project being worked on. When a
> generated file links a Forge reference, write the resolved absolute path.

The product phase. Capture what is being built, for whom, what ships first, and
how much ceremony it warrants. Nothing is designed here and nothing is built —
but every later phase decides from this document, so a thin scope makes a
confident architecture for the wrong product.

## Before starting

Read `docs/forge/state.json` if it exists. Scope may always run — but if a scope
is already approved, say so and ask whether this is a revision before overwriting.

## The interview

**One question at a time.** Multiple choice where the option set is closed, open
where it is not. Do not batch questions into a form — the answers to early
questions change which later questions matter.

Cover, in roughly this order:

1. **The problem** — what is broken or missing, stated without a solution in it
2. **Users** — who they are, what each is trying to get done, and which one v1
   serves first when they conflict
3. **Today's alternative** — what those users do now instead (a spreadsheet, a
   competitor, nothing). This is what v1 has to beat, and the bar is usually
   lower or higher than assumed
4. **Core flows** — the three to seven paths that must work, each with the
   check a person would do to say it works. Each becomes an e2e test
5. **First release** — which flows ship in v1 and which wait. Slice by the
   smallest thing a real user would use, not by layer
6. **Riskiest assumptions** — what has to be true for this to be worth
   building, and how v1 will find out
7. **Non-goals** — what this deliberately does not do
8. **Success criteria** — observable, not aspirational
9. **Surfaces** — web app, marketing site, mobile, CLI, API only. This decides
   whether the design phase runs
10. **Brand and feel** — only when a surface has UI: existing brand assets, three
    adjectives, products whose feel they like or dislike. Capture, do not design
11. **Constraints** — budget, team size and fluency, deadline, compliance, systems
    that must be integrated

Stop asking once the answers stop changing what would be built.

When `product-management:product-brainstorming` is present and the problem
itself is still vague, use it to sharpen the problem before the interview, and
say so. When `product-management:write-spec` is present, a `product` may use it
to draft per-flow specs **after** approval — the scope stays the gate.

## Non-goals are load-bearing

The scope document's most valuable section at month three is the list of what you
decided not to build. The architecture phase uses it to reject candidates that
win only on capabilities this project does not want. Push for real non-goals —
"we are not doing realtime", "no mobile app", "single tenant only" — not polite
disclaimers.

## The first release is load-bearing too

Architecture sizes the system for v1 and keeps doors open for what follows; a
scope that does not separate the two gets an architecture for the whole wish
list. Push back on a v1 that contains every flow.

## Size classification

Propose a class from the interview; the user confirms. This is the ceremony dial
for every later phase.

| Class | Means | Architecture phase | QA gates |
|---|---|---|---|
| `throwaway` | script, spike, one-off | skipped (design too) | none |
| `tool` | single-purpose, one or few users | short — stack named + rationale | typecheck + test + build |
| `product` | multi-user, real data, will live | full — discriminators, 3 candidates, decision doc | full gates + review agents |

For `throwaway`, the interview stops at problem, core flows, and constraints.

A wrong guess costs one correction, so guess rather than asking cold.

## Output

Write `docs/forge/scope.md` from `references/templates/scope.md`.

Then present it and **ask for explicit approval**. On approval, write
`docs/forge/state.json`:

```json
{
  "phase": "scope",
  "sizeClass": "<class>",
  "hasUI": <true if any surface has a user-facing UI>,
  "approvals": { "scope": "<ISO timestamp>" },
  "escalation": null
}
```

Do not stamp the approval until the user has actually approved. The gate is the
approval, not the document.

## Next

- `throwaway` → `/forge:build` (architecture is skipped)
- `tool` or `product` → `/forge:architect` (then `/forge:design` when UI is in
  scope)

State which, and stop.
