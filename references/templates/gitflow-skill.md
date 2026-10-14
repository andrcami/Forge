---
name: gitflow
description: "Branching, PR, and release procedure for this repo. Use whenever creating a branch, opening a PR, releasing, or hotfixing."
---

# Git flow

<Branch model from the architecture decision.>

## Feature work

```bash
git fetch origin <integration-branch>
git checkout -b feature/<slug> origin/<integration-branch>
# ...work, commit...
<typecheck command> && <build command> && <test command>
git push -u origin feature/<slug>
```

Open the PR with base `<integration-branch>`. Delete the branch after merge —
local and remote.

## Before the PR — gates

<!-- product: all of these. tool: the first three. throwaway: none. -->

1. **Local green** — `<typecheck>`, `<build>`, `<test>` all pass, e2e and UI/UX
   checks included when the project has UI (see the `qa` skill)
2. **Harvest** — run `/forge:harvest` and fold this branch's lessons back
3. **Docs sweep** — user-facing docs, spec-vs-implementation drift, and anything
   contradicting a binding decision. The PR body names what was updated or states
   "no doc impact". Silence reads as "forgot"
4. **Memory** — `docs/context/status.md` updated in this same PR
5. **Review agents** — run `code-review` / `pr-review-toolkit` where available
6. **Test coverage** — new behaviour has tests at the right layer, and the `qa`
   skill's flow-to-test map is current

## CI

<CI skeleton for this stack. The gates run in CI, not only locally. Every test
layer from the `qa` skill runs; e2e uploads its report and traces on failure.>

## Lessons

<!-- Filled by forge-harvest. -->
