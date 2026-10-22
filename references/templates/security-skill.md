---
name: security
description: "Security standard for <project> — its trust boundaries, the rules at each, and the review that runs before a PR crosses one. Use when changing authentication, authorization, tenant or user data, input parsing, webhooks, secrets, or anything an LLM reads or calls."
---

# Security standard

Settled by the architecture decision (`docs/forge/architecture.md`). Do not
re-litigate these in code.

## Trust boundaries

<One row per boundary in this system, from the architecture: where less-trusted
input enters, what it reaches, and who is allowed to act.>

| Boundary | Input from | Reaches | Rule |
|---|---|---|---|
| <e.g. inbound webhook> | <the provider> | <storage, consumers> | <e.g. verify the signature over the raw body; reject with 401 before storing> |

## Binding rules

<The architecture decisions with a security consequence: the auth model, tenant
isolation, data residency, secret storage, which data is personal. Each states
the rule; the rationale lives in the architecture doc. Each names the
integration test in the `qa` skill that guards it.>

## Review before the PR

A PR that touches a boundary above gets a focused security review of its diff.

<Name what is installed, with its fallback, from `<forge>/references/security/skills.md`:
security-audit in guidance mode leads; else `/security-review`; else the
built-in checklist in that reference. Say which one this project uses.>

<For a `product`: a full audit (security-audit, full audit mode) before the first
release. Its output stays outside the repo; record the run in
`docs/context/status.md`.>

## Reference

`<forge>/references/security/skills.md` (skills, when each runs, findings and
lessons, built-in checklist) · `<forge>/references/qa/testing.md` (auth at every
layer)

## Lessons

<!-- Filled by forge-harvest. Each line: the rule, then a one-clause source.
     Write the rule in Simplified Technical English: a command verb first,
     20 words or fewer, active voice (Forge's references/writing/ste.md).
     Never write exploit detail, target names, or secrets here.
     Prune stale lines in the same pass as you add new ones. -->
