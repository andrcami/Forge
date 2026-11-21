# Forge Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/forge:review`. It checks a branch against its stated intent, runs the project's own concern skills as reviewers with file:line evidence, checks tests at the boundary, and writes a marker that the PR hook reads as a merge gate. Review findings feed harvest.

**Spec:** `docs/superpowers/specs/2026-11-20-forge-review-design.md` (D14–D20).

**Defaults taken for the spec's open questions:**

| Question | Default in this plan |
|---|---|
| Second-opinion model pass for a `product` release | Not built. `security-audit`'s full audit stays the release gate |
| `enforce` by default for a `product` | No. `warn` for every class; `enforce` is opt-in |
| Panel caps | `tool` 2, `product` 4, configurable. The eval cost per sample is recorded, so the caps can be tuned later |

**Tech stack:** as today. Node 20+, TypeScript ESM, vitest, `simple-git` where the CLI already uses it, and plain `node:child_process` in the hook (the hooks have no dependencies).

## Global constraints

- **The hook stays fail-open.** Any error, a missing `git`, or a missing `state.json` means the hook lets the PR through.
- **The review gate does not depend on the lesson library.** `settings()` in `hooks/lesson-checkpoint.mjs` returns `null` when no `store` is configured. The gate needs its own settings function, so it works in a project with no library.
- **No gate for a `throwaway`, or for a repo with no `docs/forge/state.json`.** A non-Forge repo is never held.
- **The marker and report live under `$(git rev-parse --git-common-dir)/forge/review/`.** They are never committed, and worktrees share them.
- **The skill never writes the marker JSON by hand.** It calls `forge review mark`, like lessons go through `forge lessons write`.
- **Generated content reads normally.** Caveman mode never applies to the report or the marker.
- **The reviewer output format is fixed:** `BLOCK | WARN | SUGGEST — <file>:<line> — <what>`, then `rule:` and `fix:` lines. The evals and the synthesis parse it.

## File structure

```
src/review.ts                       marker type, paths, read/write, status
src/cli.ts                          + `forge review status|mark` (before loadConfig)
hooks/lesson-checkpoint.mjs         + review gate on PR creation
skills/review/SKILL.md              the four stages, --fix, --plan
references/review/reviewer.md       the brief each reviewer subagent gets
references/review/panel.md          path → concern mapping rules, caps, tie-breaks
skills/build/SKILL.md               handoff runs /forge:review --plan
skills/harvest/SKILL.md             step 0 reads the review folder; D20 rules
references/templates/claude-md.md   session end: review, then harvest
references/templates/qa-skill.md    Before the PR: /forge:review
evals/src/check.ts, run.ts          + `review` phase and `expect.review`
evals/projects/review-*/            four samples
tests/review.test.ts                marker and status
tests/lesson-checkpoint.test.ts     + gate table
tests/cli.test.ts                   + review commands
tests/evals-check.test.ts           + review checks, coverage
README.md, evals/README.md          docs
.claude-plugin/plugin.json          0.13.0 → 0.14.0
```

---

## Task 1: The marker (`src/review.ts`)

**Files:** create `src/review.ts` and `tests/review.test.ts`.

The marker is keyed by the reviewed `HEAD`. A later commit makes it stale.

```ts
export type ReviewVerdict = 'pass' | 'changes' | 'misaligned'

export interface ReviewMarker {
  sha: string            // the HEAD that was reviewed
  base: string           // the merge base it was reviewed against
  verdict: ReviewVerdict
  intent: 'aligned' | 'partial' | 'misaligned' | 'none'
  intentSource: string   // "issue #12", "plan docs/plans/x.md", "branch and commits", "none"
  blocks: number
  warns: number
  panel: string[]        // concern skills that reviewed, e.g. ["backend", "qa", "security"]
  tests: Record<string, 'passed' | 'failed' | 'not run'>
  reviewedAt: string     // ISO
}

export async function reviewDir(cwd: string): Promise<string>          // <git-common-dir>/forge/review
export async function headSha(cwd: string): Promise<string>
export async function writeMarker(cwd: string, m: Omit<ReviewMarker, 'sha' | 'reviewedAt'>, report?: string): Promise<string>
export async function readMarker(cwd: string, sha?: string): Promise<ReviewMarker | null>
export async function reviewStatus(cwd: string): Promise<{ sha: string; marker: ReviewMarker | null; latest: ReviewMarker | null }>
```

- `writeMarker` writes `<sha>.json` and, when `report` is given, `<sha>.md`. It returns the JSON path.
- `reviewStatus` returns the marker for the current `HEAD`, plus the newest marker on any sha (`latest`), so the status can say "reviewed at abc123, 2 commits ago".
- Validate on write: `verdict` and `intent` are in their sets, counts are integers ≥ 0, `verdict: 'pass'` requires `blocks === 0`, and `intent: 'misaligned'` requires `verdict: 'misaligned'`.

- [ ] Write failing tests: write then read round-trips; a new commit makes `marker` null and keeps `latest`; `pass` with `blocks: 1` is rejected; the folder sits under `git rev-parse --git-common-dir`, so it is the same in a worktree.
- [ ] Implement, using `simple-git` (`revparse(['--git-common-dir'])`, `revparse(['HEAD'])`). Resolve a relative common dir against `cwd`.
- [ ] `npm run verify`, then commit: `review: a marker keyed by the reviewed HEAD`.

## Task 2: CLI commands

**Files:** modify `src/cli.ts` and `tests/cli.test.ts`.

Put the `review` group **before** `resolveConfig`, beside `lessons check`: it needs no library.

```
forge review status [--json]
forge review mark --verdict pass|changes|misaligned --intent aligned|partial|misaligned|none
                  --source "<intent source>" --base <sha>
                  --blocks <n> --warns <n> --panel a,b,c
                  [--test test=passed --test e2e="not run" ...] [--report <file>]
```

- `status` prints one of: `reviewed: pass at <sha7>`, `reviewed: changes requested at <sha7> (N blocking)`, `stale: last review at <sha7>, HEAD is <sha7>`, `not reviewed`. Exit code 0 in every case; `--json` prints the `reviewStatus` result.
- `mark` prints the marker path. A `UsageError` names the bad flag.

- [ ] Failing tests for each `status` line and for `mark` validation errors.
- [ ] Implement. Reuse `parseArgs`; `--test` repeats.
- [ ] `npm run verify`, then commit: `cli: forge review status and mark`.

## Task 3: The gate in the PR hook

**Files:** modify `hooks/lesson-checkpoint.mjs` and `tests/lesson-checkpoint.test.ts`.

The hook is plain `.mjs` with no dependencies, so it reads git with `execFileSync('git', [...], { cwd, timeout: 2000 })` inside a `try`.

Add:

```js
export const REVIEW_DEFAULTS = { gate: 'warn' }
/** 'warn' | 'enforce' | null. Independent of the lesson library. */
export function reviewGate(config, state)
```

- `reviewGate` returns `null` when `state` is missing, when `state.sizeClass === 'throwaway'`, or when `config.review === false` or `config.review.gate === false`. An unknown value falls back to `warn`.
- `state` is read from `docs/forge/state.json` at the git top level (`git rev-parse --show-toplevel`), not from `cwd`.
- `config` comes from the existing `findConfig`. It must no longer short-circuit on a missing `store` for the review path: split the early `settings(...)` return so the PR branch evaluates the review gate first.

On a `pr` action, the order is:

| Gate | Marker for `HEAD` | Result |
|---|---|---|
| `null` | — | today's harvest behaviour |
| `warn` | `pass` | today's harvest behaviour |
| `warn` | missing, `changes`, or `misaligned` | if `held.review` is unset or older than `RETRY_MS`: set it, deny with `messages.review(status)`. Otherwise clear it and fall through to the harvest hold |
| `enforce` | `pass` | today's harvest behaviour |
| `enforce` | missing, `changes`, or `misaligned` | deny every time with `messages.reviewEnforced(status)` |

`messages.review` says why the PR was held (not reviewed, stale, or changes requested, with the count), to run `/forge:review`, and that the retry goes through. `messages.reviewEnforced` says the PR cannot open until a passing review exists for this `HEAD`, and how to set `"review": { "gate": "warn" }` in `.forge.json`.

The hook reads markers as files: `<common-dir>/forge/review/<sha>.json`. It does not import `src/review.ts`.

- [ ] Failing tests, using a temp git repo with a `state.json`:
  - no `state.json`: PR passes the review gate (only the harvest hold, when a library is configured);
  - `throwaway`: no review hold;
  - no library configured and `warn`: held once for review, then goes through with no harvest hold;
  - `warn`, no marker: held once, then the harvest hold, then through;
  - `warn`, `pass` marker for `HEAD`: harvest hold only;
  - `warn`, `pass` marker for an older sha: held as stale;
  - `enforce`, `changes` marker: denied on every attempt; denied again after `RETRY_MS`;
  - `enforce`, then a `pass` marker is written: harvest hold, then through;
  - `review: false`: today's behaviour;
  - git missing from `PATH`: fail-open.
- [ ] Implement.
- [ ] `npm run verify`, then commit: `hooks: hold a pull request until this HEAD is reviewed`.

## Task 4: The review skill

**Files:** create `skills/review/SKILL.md`, `references/review/reviewer.md`, and `references/review/panel.md`.

`skills/review/SKILL.md`, written from the spec's stages. Frontmatter:

```yaml
---
name: review
description: "Review a branch before its pull request: check it against the scope, plan, and binding decisions, run the project's concern skills as reviewers with file:line evidence, check tests at the boundary, and record the verdict the PR gate reads. Use before opening a PR, or with --plan before implementing a plan."
---
```

Sections, in order:

1. **Before starting.** Read `state.json`. Refuse when build has not run. Stop with a sentence for a `throwaway`. Find the base: the PR base when known, else `main`/`master`, and say which.
2. **Stage 1, intent.** The source ladder (issue, then plan file, then branch and commits, then none), the three verdicts, and the stop on `misaligned`. When the conflict is with a document, raise an escalation in the format every phase reads (see `skills/architect/SKILL.md`, *Escalation*). On a stop, record it: `forge review mark --verdict misaligned --intent misaligned ...`.
3. **Stage 2, the panel.** Follow `references/review/panel.md`. Start each reviewer as a subagent with the brief in `references/review/reviewer.md`, all in one message so they run in parallel. Each reviewer sees only its own paths' diff. Say which external security path ran (`security-audit` guidance mode, `/security-review`, or the built-in checklist in `references/security/skills.md`).
4. **Stage 3, tests.** Read the `qa` skill's flow-to-test map; apply the spec's rules for a missing spec and a mocked boundary. Run `test`, then `integration` and `e2e` from `docs/forge/commands.json` where their services exist. Never report a command as passed when it did not run.
5. **Stage 4, synthesis.** Deduplicate. Check each `BLOCK`: the file:line is in the diff, and the rule exists in the named skill, decision, or lesson (`forge lessons list --json`). Downgrade otherwise and say so. Print the summary block from the spec. Write the report to a temp file, then call `forge review mark ... --report <file>`.
6. **`--fix`.** One `BLOCK` at a time, each for approval; no commits. Re-run stage 3, then only the reviewers whose paths changed. At most three rounds. Mark again at the new `HEAD` only after the user commits.
7. **`--plan`.** Stage 1 against the plan file. Report the steps that trace to no flow, steps that touch a non-goal or contradict a binding decision, and flows with no test in the plan. Write no marker: a plan has no `HEAD` to gate.
8. **What harvest takes from this.** Each finding that cited a lesson id; each confirmed finding that cited only a generic rule; each finding the user rejected that came from a lesson. Harvest reads them from the report.

`references/review/panel.md`:

- path → concern: match each changed path against each generated skill's boundaries section. Unowned paths go to `backend` when server-side, else `frontend`. Docs-only and lockfile-only changes need no reviewer;
- always include `qa`. Include `security` when a changed path is on a trust boundary row in the `security` skill;
- caps: `review.maxReviewers` from `.forge.json` (defaults `tool: 2`, `product: 4`). Over the cap, keep `security` when it matched, then by changed lines;
- a branch whose only change is tests gets `qa` alone.

`references/review/reviewer.md`, the brief a reviewer subagent gets:

- you are the `<concern>` reviewer for this project; your rules are the attached `SKILL.md` and the binding decisions listed;
- review only the diff below. Report only what breaks a rule you can name. A finding without a `file:line` in this diff and a named rule is a `SUGGEST` at most;
- do not repeat what a command in `commands.json` already checks (lint, typecheck);
- the output format, exactly. End with `DONE <concern> <n> findings`; when there are no findings, write `DONE <concern> 0 findings` alone.

- [ ] Write the three files. Keep `SKILL.md` under 200 lines; detail goes to the references.
- [ ] Check the frontmatter parses (`npm run verify` runs the skill-results tests; also check by hand with a YAML parser).
- [ ] Commit: `review: the skill, the panel rules, and the reviewer brief`.

## Task 5: Wire review into build, harvest, and the templates

**Files:** modify `skills/build/SKILL.md`, `skills/harvest/SKILL.md`, `references/templates/claude-md.md`, and `references/templates/qa-skill.md`.

- **build, Handoff:** after the plan is written (by `superpowers:writing-plans` or the built-in path), run `/forge:review --plan` on it, and show its result before the terminal step. A plan with a non-goal or a contradicted decision goes back to the planner, not forward.
- **build, Optional skill detection:** no change for review. It is Forge's own skill.
- **claude-md template, Session end:** "Run `/forge:review`, then the harvest (`/forge:harvest`), before opening the PR."
- **qa-skill template, Before the PR:** a first line: "`/forge:review` passes for this `HEAD` (`forge review status`)."
- **harvest, step 0:** add `$(git rev-parse --git-common-dir)/forge/review/*.md` to the notes it sweeps. Open `WARN` findings go to `status.md` with origin `review <sha7>`.
- **harvest, a new short section after step 0, "Review findings" (D20):**
  - a finding that cited a lesson id is a sighting: write it with `forge lessons write` under that id, so it counts as evidence;
  - a confirmed `BLOCK` or `WARN` that cited no lesson goes through questions 1–3 like any candidate;
  - a rejected finding that came from a lesson: propose `forge lessons retire <id> --reason ...`, never run it unasked.
- **hooks message:** the harvest `pr` message already runs after the review hold, so no change.

- [ ] Edit. Keep build's wording style: each rule one line, the rule first.
- [ ] Commit: `build, harvest: review the plan at handoff and fold review findings into lessons`.

## Task 6: Evals

**Files:** modify `evals/src/check.ts`, `evals/src/run.ts`, `tests/evals-check.test.ts`, and `evals/README.md`. Create `evals/projects/review-*`.

Review samples start from a branch, like harvest samples: a `seed/` committed on `main` with a Forge state, generated skills, and `docs/forge/*`, then a `branch/` with the change.

- **run.ts:** add `review` to `PHASE_PROMPT`: "/forge:review — the current branch is finished; review it against main." Add `review` to `LIBRARY_PHASES` in `check.ts` (it uses the same branch harness), or add a sibling `BRANCH_PHASES` if `isHarvest` misreads it. Allow `Bash(forge:*)` and the commands from `commands.json`.
- **check.ts:** a new `expect.review` block:

  ```json
  "review": {
    "verdict": "misaligned",
    "intent": "misaligned",
    "blocksAtLeast": 1,
    "panelIncludes": ["database"],
    "reportMatches": [{ "pattern": "internal/store/store\\.go:\\d+", "why": "..." }],
    "reportAbsent":  [{ "pattern": "BLOCK", "why": "..." }]
  }
  ```

  It reads the marker for the branch `HEAD` and its report. A missing marker fails `review.marker`.

The `harvest-lessons` seed has no `docs/forge/` and one library lesson, so it is not enough for review. Create one shared seed, `evals/projects/review-binding/seed/`: copy the `harvest-lessons` seed, then add `docs/forge/state.json` (`tool`, build approved), `scope.md` (with a non-goals row for a multi-tenant admin dashboard), `architecture.md` (a binding decision: all writes go through `internal/store`), `commands.json`, the `qa` and `security` skills, and `lib/verify-webhook-raw-body.md` (copy it from `lessons-dedupe/seed/lib/`). The other three samples use `"seedFrom": "review-binding"`.

Samples:

| Sample | Branch | Expect |
|---|---|---|
| `review-misaligned` | adds a multi-tenant admin dashboard that the scope names as a non-goal | verdict and intent `misaligned`; the report names the non-goal; no panel ran (`panel` empty) |
| `review-binding` | a raw SQL string in `internal/deliver` where the architecture decision says all writes go through `internal/store` | at least 1 `BLOCK`; the report matches `internal/deliver/.*\.go:\d+` and the decision id |
| `review-lesson` | verifies a webhook signature over the re-encoded JSON body | a finding citing `verify-webhook-raw-body` (seed it in `lib/`) |
| `review-quiet` | a small, tested change inside `internal/store` | verdict `pass`; `reportAbsent` `BLOCK`; panel `database`, `qa` only |

- [ ] Failing unit tests in `tests/evals-check.test.ts` for `expect.review`: a missing marker, a wrong verdict, `blocksAtLeast`, `panelIncludes`, and both report patterns.
- [ ] Implement the check and the phase; add the samples, with `brief.md` per sample in the harvest style.
- [ ] Extend the coverage test so each review sample is required, and add the four rows to the `evals/README.md` table.
- [ ] `npm run verify`.
- [ ] Run the four samples with the `run-evals` skill (tell the user the cost first). Fix the instructions, not the samples, on a FAIL. Then run every sample against the final files and commit `evals/receipt.json`.
- [ ] Commit: `evals: four review samples and expect.review`.

## Task 7: Docs and release

**Files:** modify `README.md`, `docs/superpowers/specs/2026-08-31-forge-framework-design.md`, and `.claude-plugin/plugin.json`.

- **README:**
  - add a `/forge:review` row to the Phases table (ongoing);
  - add a "Review" section after QA: the four stages in one line each, the gate table, and the `review` config block;
  - add a line to the lesson checkpoints table: "before a pull request: held first for review when the gate is on, then for harvest".
- **framework spec:** add D14–D20 to the decisions table as one row each, pointing to the review spec.
- **plugin.json:** `0.13.0` → `0.14.0`. The hook changes what installed copies do.
- **Skill checks:** CI runs SkillEvaluator on every skill, including the new `review`, and fails until the README table matches. After the first CI run, download the `skill-evaluator-tier1-evidence` artifact and run `npm run skills:readme -- <folder>`; commit the table. If `review` scores under 70, fix the skill, not the threshold.
- [ ] Edit, then `npm run verify`.
- [ ] Commit: `docs: review in the README and the framework decisions; 0.14.0`.

## Order and parallelism

Tasks 1 → 2 → 3 depend on each other (marker, then CLI, then hook). Task 4 depends only on the CLI flags from Task 2, so it can run beside Task 3. Task 5 depends on 4. Task 6 depends on 1–5. Task 7 is last.

With parallel agents: run {3, 4} together after 2; the rest one at a time.

## Done when

- `npm run verify` passes.
- `npm run eval:receipt` reports the receipt as current, with all samples (old and new) passing.
- The skill-checks table includes `review` with a pass.
- In a real Forge project: `/forge:review` on a branch writes a marker; `gh pr create` is held once in `warn` and denied in `enforce` until the marker passes; harvest picks the open `WARN`s into `status.md`.
