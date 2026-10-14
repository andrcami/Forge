---
name: <design-system>
description: "Visual and interaction standard for <project> — tokens, components, motion, and the review gate for UI work. Use for any change that renders something a user sees."
---

# <Design system> standard

Settled by the design decision (`DESIGN.md`). Do not re-litigate the direction
in a component — propose a `DESIGN.md` revision instead.

## Binding rules

<The DESIGN.md non-negotiables, as rules. Always include:>

- Colour, type, spacing, radius, and elevation come from tokens in
  `<path to tokens file>`. A literal value in a component is a bug.
- Every animation honours `prefers-reduced-motion`.
- Body text meets 4.5:1 contrast, large text and UI glyphs 3:1, in every theme.
- Every interactive element has a visible focus state; touch targets ≥ 44×44 px.

## Which skill leads what

| Work | Load | When absent |
|---|---|---|
| App screens, components, tokens | <visual lead for app> | built-in rules (`<forge>/references/design/skills.md`) |
| Public / marketing pages | <visual lead for marketing, or "n/a"> | <fallback> |
| Motion | <motion lead> | lens table in the reference |

**Motion lens:** primary <…>, secondary <…>, selective <…>. Apply the frequency
gate: hundreds-a-day actions are instant, keyboard-initiated ones never animate.

## Components

<Inventory from DESIGN.md, one line each with its rule. Add a line when a
component is added; a component not listed here is a component nobody owns.>

## Review gate

Before any PR that changes UI:

<The checks from DESIGN.md, each with the skill that runs it and the fallback.
The automated ones — axe, visual regression, keyboard, reduced motion — live in
the `qa` skill's UI/UX checks; link to them rather than restating.>

## Reference

`DESIGN.md` (binding) · `<forge>/references/design/skills.md` (generic know-how)

## Lessons

<!-- Filled by forge-harvest. Each line: the rule, then a one-clause source.
     Prune stale lines in the same pass as you add new ones. -->
