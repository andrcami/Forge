# Design skills — what each is for, and when it leads

External skills Forge detects and wires into the design phase and the generated
`design-system` / `frontend` skills. None is a hard dependency: detect, use when
present, degrade when absent, and **say which path you took**.

They disagree on purpose. Each is strongest on a different surface, so the design
phase picks one to **lead** per surface rather than stacking all of them.

## The catalog

| Skill | Leads on | Not for | Install |
|---|---|---|---|
| **ui-ux-pro-max** (`nextlevelbuilder/ui-ux-pro-max-skill`) | App screens, dashboards, design-system tokens, stack-specific UI rules (React, Next.js, Vue, Svelte, SwiftUI, Flutter, Tailwind, shadcn…), UX and accessibility checks | Art-directed marketing pages — its output is competent, not distinctive | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| **taste-skill** (`leonxlnx/taste-skill`, skill `design-taste-frontend`) | Landing pages, marketing sites, portfolios, any public-facing page that must not look AI-made. Deals researched directions, checks the result in a real browser | Dashboards and app screens — its own description excludes them. Needs Node 22+ and Chrome for its scripts | `/plugin marketplace add Leonxlnx/taste-skill` then `/plugin install taste-skill@taste-skill` |
| **design-motion-principles** (`kylezantos/design-motion-principles`) | Motion: enter/exit, transitions, micro-interactions, and auditing motion for AI-slop tells. Weights three lenses (Emil Kowalski restraint, Jakub Krehel polish, Jhey Tompkins play) by project type | Static visual design | `npx skills add kylezantos/design-motion-principles` |
| **DESIGN.md references** (`VoltAgent/awesome-claude-design`, files at getdesign.md) | A starting reference when the project has no brand: 68 real design languages written as `DESIGN.md` files | Shipping as-is — see the rule below | Nothing to install; fetch the one file you need |
| `frontend-design` | General frontend aesthetics when none of the above is present | — | ships with Claude Code's official plugins |
| `design:accessibility-review`, `design:design-critique` | WCAG audit and structured critique as a review gate | Generating anything | the `design` plugin |

## Choosing the lead, per surface

| Surface in scope | Visual lead | Fallback when absent |
|---|---|---|
| App / dashboard / internal tool | ui-ux-pro-max | `frontend-design`, then the built-in rules below |
| Marketing / landing / public pages | taste-skill | ui-ux-pro-max, then `frontend-design` |
| Both | ui-ux-pro-max owns the system and tokens; taste-skill art-directs the public pages **on those tokens** | as above, per surface |
| Mobile (native or RN/Flutter) | ui-ux-pro-max (stack guidelines) | built-in rules |

Motion always goes to design-motion-principles when present, whatever the visual
lead. Two skills generating motion rules for one project is how a site ends up
with three easing curves.

## Motion lens weighting

From design-motion-principles. Record the weighting in `DESIGN.md` so every
later session applies the same lens instead of re-deciding it.

| Project type | Primary | Secondary | Selective |
|---|---|---|---|
| Productivity tool | Emil (restraint) | Jakub | Jhey — onboarding only |
| SaaS dashboard | Emil | Jakub | Jhey — empty states |
| Marketing / landing | Jakub (polish) | Jhey | Emil — forms, nav |
| Consumer / mobile app | Jakub | Emil | Jhey — delighters |
| E-commerce | Jakub | Emil | Jhey — product showcase |
| Creative / portfolio / kids | Jakub | Jhey (play) | Emil — high-frequency interactions |

**The frequency gate** applies in every lens: rare interactions may be expressive,
daily ones subtle and fast, hundreds-a-day ones instant, keyboard-initiated ones
never animated.

## Using a DESIGN.md reference

A reference from awesome-claude-design is a **starting point for the system's
structure**, never the identity:

- Take its *proportions and rules* — type scale, spacing rhythm, density, radius,
  how many accents. Those are what make it feel coherent.
- Replace its *identity* — name, logo, signature colour, proprietary typeface.
  Shipping another company's look as your product's is impersonation, and it is
  the first thing anyone notices.
- Record in `DESIGN.md` which reference it started from and what was changed.

## Built-in rules (the degrade path)

When no design skill is present, these still hold. They are the floor, not the
design.

- **Contrast** — body text 4.5:1, large text and UI glyphs 3:1, in light and dark.
- **Reduced motion** — every animation honours `prefers-reduced-motion`. No exceptions.
- **Focus** — every interactive element has a visible focus state. Never remove an
  outline without replacing it.
- **Targets** — touch targets at least 44×44 px.
- **Tokens, not literals** — colour, spacing, radius, and type come from tokens.
  A hard-coded hex in a component is a drift bug.
- **No slop tells** — no emoji as icons, no purple-to-pink gradient by default, no
  hover-scale on everything, no stagger on static content, no pulsing indicators
  that are not live status, no eyebrow label over every heading.
