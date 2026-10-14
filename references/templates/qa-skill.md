---
name: qa
description: "Testing standard for <project> — which layer tests what, the flow-to-test map, the e2e and UI/UX checks, and the commands that run them. Use when writing or reviewing tests, adding a feature or flow, or before any PR."
---

# QA standard

Settled by the scope's core flows (`docs/forge/scope.md`), the architecture's
binding decisions (`docs/forge/architecture.md`), and, when UI is in scope,
`DESIGN.md`. Size class: **<tool | product>**.

## Binding rules

- Every v1 core flow has an e2e test named after it. A new flow ships with its test.
- Every check lives at the lowest layer that can see the failure.
- No sleeps, no order-dependent tests, no shared mutable fixtures.
- Never skip, disable, or quarantine a test to get green.
<!-- Add one line per binding architecture decision that has a failure mode, naming
     the integration test that guards it (tenant isolation, idempotency, auth). -->

## Layers in this repo

| Layer | Runner | Lives in | Command |
|---|---|---|---|
| Unit | <runner> | <path> | `<command>` |
| Integration | <runner + real store how> | <path> | `<command>` |
| Contract | <runner> | <path> | `<command>` |
| E2E | Playwright | `e2e/flows/` | `<command>` |
| UI/UX QA | Playwright + axe | `e2e/ux/` | `<command>` |

Confirm every path above is inside its runner's include glob. A directory
outside it never runs and stays green.

## Flow-to-test map

| Core flow (scope) | E2E spec | Status |
|---|---|---|
| <flow> | `e2e/flows/<flow>.spec.ts` | <planned / covered> |

## UI/UX checks

<!-- UI projects only. Scaled by size class — see the reference. -->

- **Accessibility:** axe (WCAG 2.1 AA) on every page state each flow reaches
- **Keyboard:** each core flow completes with the keyboard alone
- **Visual regression:** <breakpoints from DESIGN.md> × <themes>, baselines
  generated in the pinned Playwright image `<image:tag>`
- **Reduced motion:** flows pass under `reducedMotion: 'reduce'`
- **Browsers:** <chromium | chromium + webkit + mobile viewport>

## Before the PR

1. `<all-tests command>` green locally
2. New or changed flows have their e2e spec; the map above is current
3. Visual baseline changes are intended, and the PR shows them
4. <Wired review skills, each with its fallback — see Build's optional skills>

## Reference

`<forge>/references/qa/testing.md` (layers, scaling) ·
`<forge>/references/qa/playwright.md` (e2e and UI/UX recipes)

## Lessons

<!-- Filled by forge-harvest. Each line: the rule, then a one-clause source.
     Prune stale lines in the same pass as you add new ones. -->
