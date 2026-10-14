# DESIGN.md — <project name>

<!-- Written by /forge:design. Token, rule, and rationale live together here so an
     agent can make its next decision and stay on-system in a case this file never
     covered. Readable by Claude Design and Stitch as well as by the project's
     own skills. -->

**Date:** <YYYY-MM-DD>
**Scope:** `docs/forge/scope.md` · **Architecture:** `docs/forge/architecture.md`
**Surfaces:** <app | marketing | mobile — those in scope>
**Lead skills:** <visual lead per surface, motion lead — or "built-in rules" and why>

## Direction

<One paragraph: the idea the look is built on, taken from the subject itself —
not from the category. Then the three adjectives from the scope, and what each
means concretely here.>

**Started from:** <existing brand | a ui-ux-pro-max generated system | a taste-skill
dealt direction | a DESIGN.md reference (name it) — and what was changed>

**Rejected directions:**

| Direction | Why it lost |
|---|---|
| <direction> | <the specific reason — off-brand, needs assets that do not exist, fights the subject> |

## Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | | | page ground |
| `--color-fg` | | | body ink |
| `--color-muted` | | | secondary text |
| `--color-accent` | | | the one action colour |
| `--color-border` | | | dividers, inputs |
| `--color-danger` / `--color-success` | | | status only |

<Proportions: how much ground, ink, accent. An accent used everywhere is not an accent.>

### Type

| Role | Family | Size / line-height | Weight |
|---|---|---|---|
| Display | | | |
| Heading | | | |
| Body | | | |
| Small / UI | | | |
| Mono (if any) | | | |

### Space, radius, elevation

- **Spacing scale:** <e.g. 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64>
- **Radius:** <values and where each applies>
- **Elevation:** <shadows, or "none at rest">

## Components

<The inventory v1 needs, from the scope's core flows. One line each: the
component, its variants, and the rule that keeps it consistent.>

## Layout

<Grid, breakpoints, max widths, density. For marketing pages: the section
argument from the copy — the claims each section makes, in order.>

## Motion

- **Lens weighting:** primary <…>, secondary <…>, selective <…> — because <project type>
- **Durations:** <ranges per interaction frequency>
- **Easing:** <the curves — one for enter, one for exit, one spring if any>
- **Never animate:** <keyboard-initiated actions, high-frequency actions, …>
- `prefers-reduced-motion`: <what each animation falls back to>

## Voice

<How the interface talks — tone, person, what an error message and an empty
state sound like. Two or three example strings.>

## Non-negotiables

<The visual rules that become binding lines in the generated design-system skill.
Include the accessibility floor and the slop tells this project bans.>

## Review gate

<What runs before a UI PR: motion audit, real-browser inspection for public
pages, accessibility review — whichever skills are present, and the fallback.>
