# Forge review — intent check, concern reviewers, and a merge gate

**Date:** 2026-11-20
**Status:** Draft for discussion
**Extends:** `2026-08-31-forge-framework-design.md`

## Problem

Forge gates the documents (scope, architecture, design) but not the code that
follows them. After build hands off to implementation, nothing checks that a
branch:

1. does what the scope and plan said it would, and nothing the non-goals forbid;
2. keeps the binding architecture decisions the generated skills hold;
3. has tests for the core flows it touches, run at a real boundary.

Today the PR hook holds a pull request once for a harvest. A harvest looks for
lessons; it does not look for defects. Security review is delegated
(`security-audit`, `/security-review`), and general review is not covered at all.

Forge already has what a good reviewer needs and most review tools lack: the
intent (`scope.md`, the plan), the binding rules (`architecture.md`,
`decisions.md`), one skill per concern, and the lessons each concern has
accumulated. Review should use them.

## Non-goals

- Not a replacement for `security-audit`, `/security-review`, or a human
  reviewer. It runs them where present and says when it did not.
- Not a linter. Findings a tool in `commands.json` already catches are not
  repeated.
- No unattended fixes. A fix pass proposes changes; the user decides what is
  committed.
- No review for a `throwaway`.

## Decisions

| # | Decision | Rejected |
|---|---|---|
| D14 | Review is an ongoing command (`/forge:review`), like harvest, not a fifth phase in `state.json` | A phase (phases gate documents once; review runs on every branch) |
| D15 | Review starts with an intent check against the scope, plan, and binding decisions. A `misaligned` verdict stops the review | Reviewing code quality first (a well-built wrong feature passes) |
| D16 | Reviewers are the project's generated concern skills, chosen from the paths the branch changed, each loading its own `## Lessons` | A fixed generic panel (it has no project rules), external reviewer prompts (they restate training data, D3) |
| D17 | A blocking finding must cite `file:line` and the rule it breaks (skill rule, architecture decision, or lesson id). Without both it is downgraded to a suggestion | Free-form findings (unverifiable; reviewers pad) |
| D18 | Reviewers run isolated in parallel; the lead deduplicates and synthesizes. No peer messaging | Peer-messaging reviewer teams (cost grows with reviewer count squared; Claude Code-only) |
| D19 | The merge gate is a marker keyed by the reviewed `HEAD` commit, checked by the existing PR hook. Default `warn`; `enforce` is opt-in | Holding once like harvest (a second attempt passes unreviewed), enforce by default (blocks adoption) |
| D20 | Review findings feed harvest: a finding that cites a lesson is a new sighting of it; a confirmed finding that cites no rule is a lesson candidate | Separate review memory (two libraries that drift) |

## The command

```
/forge:review              # review this branch against its base
/forge:review --plan       # review an implementation plan before coding starts
/forge:review --fix        # after the review, propose fixes for blocking findings
```

### Before starting

Read `docs/forge/state.json`. Refuse when build has not run (there are no concern
skills to review with). Say so and stop for a `throwaway`.

### Stage 1 — Intent check

Find what the branch is meant to do, from the first source that exists, and say
which one was used:

1. the linked issue (PR body, or `Refs #N` in commits);
2. the plan file the build handoff wrote;
3. the branch name and commit messages;
4. none: say "no stated intent found" and continue with stages 2–4 only.

Compare the diff with that intent and with `scope.md` (v1 flows, non-goals) and
`architecture.md` (binding decisions). The verdict is one of:

- `aligned`;
- `partial`: what is missing, as a list;
- `misaligned`: the branch builds a non-goal, contradicts a binding decision, or
  does something other than its intent. **Stop.** When the conflict is with a
  document rather than the code, raise an escalation to the owning phase, as
  architecture does today.

### Stage 2 — Concern reviewers

Map each changed path to the concern skill that owns it. Use the skill's own
boundaries section; when a path has no owner, assign `backend` or `frontend`.
Always add `qa`. Add `security` when a changed path crosses a trust boundary the
security skill lists.

Cap the panel by size class: `tool` 2, `product` 4. When more skills match, keep
the ones with the most changed lines, and always keep `security` when it matched.

Each reviewer is a subagent with: the diff limited to its paths, its `SKILL.md`
(rules and `## Lessons`), the binding decisions it enforces, and the evidence
rule (D17). It writes findings as:

```
BLOCK | WARN | SUGGEST — <file>:<line> — <what is wrong>
  rule: <skill rule | architecture D# | lesson id>
  fix:  <one line>
```

Where `security-audit` (guidance mode) or `/security-review` is installed, the
security reviewer runs it and merges its output. Say which path ran.

### Stage 3 — Tests at the boundary

From the `qa` skill's flow-to-test map:

- every core flow the diff touches must have a spec whose status is not
  `planned`; a missing spec is a `BLOCK` for a `product` and a `WARN` for a `tool`;
- a spec that mocks the boundary its flow crosses (the database, the payment
  provider, the browser) is a `WARN`: it does not prove the flow;
- run `test`, then `integration` and `e2e` from `commands.json` where their
  services exist. Report the ones that could not run as not run, never as passed.

### Stage 4 — Synthesis

Deduplicate findings across reviewers. Check each `BLOCK` cites a line that the
diff contains and a rule that exists; downgrade it otherwise (D17). Report:

```
Intent: aligned (source: plan docs/plans/2026-11-20-invites.md)
Panel:  backend, database, qa, security (security-audit, guidance mode)
Tests:  test ✓  integration ✓  e2e not run (no browser)
BLOCK 1 · WARN 3 · SUGGEST 2
```

The verdict is `pass` (no `BLOCK`) or `changes requested`.

### `--fix`

Propose a fix for each `BLOCK`, one at a time, for approval. Do not commit.
After the fixes, run stage 3 again and only the reviewers whose paths changed.
Stop after three rounds and report what is still open.

### `--plan`

Run stage 1 on the plan instead of a diff: does each step trace to a scope flow?
Does a step touch a non-goal or contradict a binding decision? Does every flow
the plan covers have a test in the plan? The build handoff calls this after
`superpowers:writing-plans`, before implementation starts.

## The merge gate

The review writes a marker outside the work tree:

```
$(git rev-parse --git-common-dir)/forge/review/<head-sha>.json
{ "verdict": "pass", "blocks": 0, "reviewedAt": "...", "panel": [...] }
```

The report is written beside it, as `<head-sha>.md`. Harvest step 0 already
sweeps untracked build notes; add this folder to what it reads, so open `WARN`
findings reach `status.md`.

`hooks/lesson-checkpoint.mjs` already intercepts PR creation. Extend that branch:

| Setting `review.gate` | Marker for `HEAD` | Result |
|---|---|---|
| `false` | — | today's behaviour |
| `warn` (default) | missing or `changes requested` | hold once with a message to run `/forge:review`; the retry goes through |
| `enforce` | missing or `changes requested` | deny every attempt until a passing marker exists for `HEAD` |
| either | `pass` | harvest hold only, as today |

A new commit changes `HEAD`, so a reviewed branch that changes afterwards needs a
new review. The hook reads `state.json` and does nothing for a `throwaway`. It
stays fail-open on any error, like every Forge hook.

```json
"review": { "gate": "warn", "maxReviewers": { "tool": 2, "product": 4 } }
```

## Feeding the library (D20)

At harvest:

- each finding that cited a lesson id is a sighting of that lesson in this
  project. Two projects make an `observed` lesson `confirmed`, as today;
- each confirmed `BLOCK` or `WARN` that cited only a generic rule becomes a
  lesson candidate, shown for approval with the four harvest questions;
- a finding the user rejected as wrong, when it came from a lesson, is evidence
  to retire that lesson. Propose the retirement; do not do it.

This is the part no other review tool has: the reviewer gets better with each
project, and its false alarms remove the rules that caused them.

## Code changes

- `skills/review/SKILL.md`, from the stages above.
- `src/review.ts`: read and write the marker; `forge review status [--sha]` and
  `forge review mark` in `src/cli.ts`, so the skill never writes the JSON by hand.
- `hooks/lesson-checkpoint.mjs`: the gate table, reading `review.gate` and
  `state.json`.
- `skills/build/SKILL.md`: the handoff calls `/forge:review --plan`; the
  generated `CLAUDE.md` session-end section names `/forge:review` before harvest.
- `skills/harvest/SKILL.md`: step 0 reads the review folder; D20 rules.
- Tests: marker read/write, the gate table per setting, `throwaway` passthrough,
  a stale marker after a new commit.

## Evals

| Sample | Seed | Expect |
|---|---|---|
| `review-misaligned` | a branch that builds a scope non-goal | verdict `misaligned`, stops before reviewers, names the non-goal |
| `review-binding` | a branch that breaks an architecture decision (raw SQL where the decision says a query builder) | a `BLOCK` citing the file:line and the decision |
| `review-quiet` | a clean branch with tests | `pass`, no padded findings |
| `review-lesson` | a branch that repeats a seeded library lesson's bug | a finding citing that lesson id |

## Open questions

1. A second-opinion pass on a different model for `product` releases: worth the
   cost, or does `security-audit`'s full audit already cover the release gate?
2. Should `enforce` be the default for a `product` once the review has run
   cleanly on a few branches?
3. Panel caps of 2 and 4 are guesses. The evals should report cost per sample so
   they can be tuned.
