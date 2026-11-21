# Forge adopt — bring an existing codebase under Forge

**Date:** 2026-11-20
**Status:** Draft for discussion
**Extends:** `2026-08-31-forge-framework-design.md`

## Problem

Forge starts at `/forge:scope`: it assumes there is an idea and no code. Most
work is on code that already exists. Today the only thing Forge does with an
existing repo is `/forge:lessons import`, which reads its skills for lessons.
An existing project cannot get Forge's generated skills, `qa` map, `security`
boundaries, or review gate without pretending to start over.

The phases cannot just be run on an existing repo. The scope interview asks what
to build, when the answer is already in the code. The architecture phase
compares stacks that were chosen years ago. Build re-initializes a repo that
has history, CI, and a `CLAUDE.md` someone wrote by hand.

## Non-goals

- Not a refactor. Adopt does not change application code.
- Not a re-decision. The as-built stack is recorded, not compared against
  alternatives. A later deliberate change uses `/forge:architect` as usual.
- Not enforcement on day one. Hooks start in `warn`; tests and gates that do not
  exist yet are proposed as follow-ups, not switched on.
- Not silent merges. Where the repo's existing rules conflict with what Forge
  would write, the user decides.

## Decisions

| # | Decision | Rejected |
|---|---|---|
| D21 | One command, `/forge:adopt`, writes the scope and architecture documents as **as-built** records, marked `origin: adopted`, then runs build in adopt mode | Running scope and architect unchanged (they ask the wrong questions), a separate lightweight mode with no documents (later phases and review have nothing to read) |
| D22 | Every claim in the as-built documents is tagged `[repo]` (read from the code, with a path) or `[you]` (only the user knows). The user confirms `[you]` claims; adopt never guesses intent, non-goals, or the riskiest assumption | Inferring the whole scope from the code (the code shows what was built, not what was meant) |
| D23 | The survey is read-only and the user approves it before it starts. Nothing is written before the plan is approved | Writing as it goes (a half-adopted repo with no plan) |
| D24 | Adopt works on its own branch, one commit per artifact, with a resumable progress file outside the work tree | One large commit (unreviewable), progress in the work tree (it gets committed) |
| D25 | Existing `CLAUDE.md`, skills, CI, and hooks are kept. Forge adds; on a conflict it asks | Replacing them (destroys the repo's own knowledge) |
| D26 | Codebase graphing (`graphify`) is offered by repository size, not by size class, and is first offered here | Tying it to the `product` class at build (a new repo has no code to graph yet) |

## The command

```
/forge:adopt            # start, or resume where the progress file stopped
/forge:adopt --status   # what is done and what is next
```

### Before starting

Refuse when `docs/forge/state.json` exists: the project already uses Forge. Say
which command fits instead (`/forge:lessons sync` to refresh skills).

Check the work tree is clean. Create the branch `forge/adopt`.

### Step 1 — Read-only survey

Ask once for approval to read the repo. Then read: manifests and lockfiles, CI
config, test config and test folders, `README`, existing `CLAUDE.md` and
`AGENTS.md`, `.claude/` (skills, hooks, settings), migrations and schema files,
entry points, and the top-level folder layout. For UI: the token, theme, or CSS
variable files.

For each check command found (test, lint, typecheck, build), run it **once**,
read-only, and record whether it passed, failed, or needs a service. Never run a
deploy, release, or migration command.

**Large repositories.** Count tracked source files. Above the threshold (default
1,500, `adopt.graphThreshold`):

- when `graphify` is installed, build the graph and use its report for the
  survey instead of reading folders one by one. Say so;
- when it is absent, offer it once with its install command, and continue
  without it on a no. The survey then samples each top-level package instead of
  reading it all, and says which packages it sampled.

Write the result to `$(git rev-parse --git-common-dir)/forge/adopt/survey.md`.

### Step 2 — As-built documents

Draft from the survey, from `references/templates/scope.md` and
`architecture.md`, with an `origin: adopted` header:

- **scope.md**: the problem and users `[you]`; the core flows `[repo]` (from
  routes, commands, and e2e specs) for the user to confirm and name the check
  for; non-goals and riskiest assumptions `[you]`; surfaces `[repo]`; size class
  proposed from the code and confirmed `[you]`.
- **architecture.md**: the stack as chosen `[repo]`; the binding decisions
  stated as rules, each with the path that shows it `[repo]` (for example, "all
  writes go through `internal/store`"); bounded contexts from the folder layout
  `[repo]`. No candidate comparison. Add one question `[you]`: the one invariant
  that must never break. Adopt does not guess it.
- **DESIGN.md**, when UI is in scope: tokens and type scale read from the
  existing theme files `[repo]`; three adjectives and the motion stance `[you]`.
  Skip it when there is no theme to read and say so; `/forge:design` can run later.

Ask about the `[you]` items one at a time, as scope does. Show each document for
approval. Approval writes `state.json`:

```json
{ "phase": "build", "origin": "adopted", "sizeClass": "tool", "hasUI": true,
  "approvals": { "scope": "...", "architecture": "...", "design": "..." },
  "escalation": null }
```

### Step 3 — Plan

List the artifacts adopt will write, each with what it adds and any conflict
with what exists. Block until the user approves. Write the list to
`forge/adopt/progress.md` with each item `pending`.

### Step 4 — Build in adopt mode

Build runs as today, with these differences:

| Build step | Adopt mode |
|---|---|
| Repo bones (`git init`, branch model, CI skeleton) | Skipped. The `gitflow` skill records the branch model the repo already uses |
| Concern skills | Generated as today. Each skill's rules come from the as-built binding decisions, and its boundaries from real paths. Library lessons load by stack as today |
| Existing `.claude/skills/` | Kept. A generated skill with the same concern is merged into it, with the merge shown for approval. Run `/forge:lessons import` over the old skills |
| `qa` flow-to-test map | Built from the confirmed flows. Each row names the existing spec that covers it, or `missing` |
| `security` boundaries | Read from the code (auth middleware, webhook handlers, upload routes), each with its path |
| Test harness | Not scaffolded. `commands.json` records the commands the survey proved. A missing layer (no e2e, no integration) becomes a follow-up, not a scaffold |
| `CLAUDE.md` | Kept. Forge's sections (session start, skills index, authority order, session end) are added; a line that contradicts an existing rule is asked about |
| Folder-level `CLAUDE.md` | For a repo over the graph threshold, one per top-level package that has its own stack or boundary, proposed and approved individually |
| Hooks | Forge's own hooks only, with the review gate in `warn` |

Commit each artifact on its own, and mark it `done` in the progress file.
`/forge:adopt` in a new session reads the progress file and continues from the
first `pending` item.

### Step 5 — Follow-ups and hand-back

Write `docs/context/status.md` with what adopt found and did not fix: flows with
no test, failing check commands, boundaries with no test, conflicts the user
deferred. These are the follow-ups; adopt does not act on them.

Report the branch and its commits. Ask before pushing or opening a pull request.

## Codebase graphing (D26)

Build's optional-skill table already lists `graphify` for the `product` class.
That trigger does not work: at build time a new project has no code, so the
graph is empty. Change it to:

- **adopt**: offered when the repo is over the threshold, as above;
- **`/forge:lessons sync` and harvest**: when a Forge-built project crosses the
  threshold later, offer it once and record the answer in `.forge.json`, as
  chat style does;
- **review**: when a graph exists, the intent check and reviewer selection use it
  to find callers of changed code that the diff does not show.

When wired, the generated `CLAUDE.md` says to read the graph report before
architecture questions, and that the graph is for reading, not a source of
truth for edits. Add its output folder to `.gitignore`.

## Code changes

- `skills/adopt/SKILL.md`, from the steps above.
- `src/state.ts`: `origin?: 'new' | 'adopted'`. The gate does not change: adopt
  writes the approvals that build already checks.
- `src/adopt.ts`: the progress file (read, mark, next item) and the source-file
  count; `forge adopt status` in the CLI.
- `skills/build/SKILL.md`: the adopt-mode table; move `graphify` from the size
  class trigger to the size threshold.
- `README.md`: an "Existing projects" section, and `graphify` under optional skills.
- Tests: the progress file resumes at the first pending item; adopt refuses when
  `state.json` exists; the threshold count ignores vendored and generated folders.

## Evals

| Sample | Seed | Expect |
|---|---|---|
| `adopt-go-service` | an existing Go API with tests, CI, and a hand-written `CLAUDE.md` | no `git init`; the old `CLAUDE.md` lines kept; skills for backend, database, qa, security; `commands.json` holds the commands that ran |
| `adopt-conflict` | a `CLAUDE.md` rule that contradicts a generated rule | adopt asks; it does not overwrite |
| `adopt-no-tests` | a repo with no test folder | the `qa` map marks each flow `missing`; no harness scaffolded; follow-ups listed in `status.md` |
| `adopt-resume` | a progress file with two items done | the run continues at item three |

## Open questions

1. Should adopt offer `/forge:review` on the adopt branch itself before the user
   merges it?
2. Is 1,500 tracked source files the right graph threshold, or should it be
   lines of code?
3. Monorepos: one Forge state per repo, or one per package that has its own
   stack?
