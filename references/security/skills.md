# Security skills — what each is for, and when it runs

External skills Forge detects and wires into the generated `security` skill and
the `qa` skill's PR gate. None is a hard dependency: detect, use when present,
degrade when absent, and **say which path you took**.

## The catalog

| Skill | Use for | Not for | Install |
|---|---|---|---|
| **security-audit** (`cloudflare/security-audit-skill`) | Focused review of a change that crosses a trust boundary (guidance mode, the default), and a full audit with independent verification of every finding (full audit mode). Covers web and auth, client side, cloud, supply chain, data isolation, RPC and messaging, AI/LLM, native code | Live systems: it never probes deployed endpoints, and runs target code only inside an OS-enforced sandbox | `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit --global` |
| `/security-review` | A quick review of the pending changes on the current branch | Coverage-led audits; it reviews the diff, not the system | ships with Claude Code |
| `security-review` (other installed skills of that name) | Same role as `/security-review` | — | as installed |

## When each runs

| Moment | What runs | Lead | Fallback |
|---|---|---|---|
| Before a PR that touches a trust boundary | A focused review of the diff against the boundaries in the project's `security` skill | security-audit, guidance mode | `/security-review`, then the built-in checklist below |
| Before the first release of a `product` | A full audit of the repository | security-audit, full audit mode | Say that no full audit was possible, and record it as an open gap in `docs/context/status.md` |
| Any time the user asks for an audit or a pen test | A full audit | security-audit, full audit mode | `/security-review` on the whole tree, with the gap stated |

A trust boundary is anywhere input from a less-trusted side reaches code that
acts on it: authentication and sessions, authorization checks, tenant or user
data, file uploads and parsing, webhooks and other inbound callbacks, outbound
requests built from input, secrets, and anything an LLM reads or calls.

Run full audit mode only when the user asks for it or a `product` reaches its
first release. It runs many agents and costs real usage; guidance mode is the
everyday tool.

### Full audit output

security-audit writes its run outside the repository by default, under
`~/security-audit-skill/<repo>/run-<N>/`: `REPORT.md`, `findings.json`, and the
coverage ledger. Keep it there. Do not commit audit output into the project: it
holds exploit detail. Record in `docs/context/status.md` that the audit ran, the
commit it covered, and the open confirmed findings by id.

Runs are additive: a later run reads the earlier ledger and findings and targets
the gaps. Keep the run directories.

## Findings and lessons

A confirmed finding is fixed in the project and gets a regression test in the
`qa` skill's integration layer. The **class** of bug may become a portable
lesson at harvest (tag `domain:security` and the owning `skill:`), written as a
rule with no exploit detail, no target names, and no secrets. The finding itself
never enters the library.

## Built-in checklist (no security skill installed)

For a change that touches a trust boundary, check before the PR:

1. Re-check authentication and authorization at every layer that acts on a
   resource, not only at the edge.
2. Scope every query that reads tenant or user data to the caller.
3. Validate input at the boundary. Reject what does not parse; do not repair it.
4. Verify signatures over the raw bytes received, before you parse them.
5. Keep secrets out of logs, errors, URLs, and the client bundle.
6. Build outbound requests from an allowlist, never from raw input.
7. Treat everything an LLM reads as untrusted input, and limit what it can call.
8. Pin dependencies through the lockfile; review any new dependency.
