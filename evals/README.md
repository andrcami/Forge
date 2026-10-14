# Framework QA — sample projects

Forge is instructions, and instructions regress silently. This directory holds
small sample projects that are run through the real phases with `claude -p`.
The result is checked against what Forge *should* have produced. Run it before
merging any change to `skills/` or `references/`.

```bash
npm run eval                         # every sample
npm run eval -- bookclub-picks       # one or more by name
npm run eval -- clinic-booking --model <id>
npm run eval -- webhook-relay --no-verify   # skip running the generated project's commands
npm run eval:check -- <workspace> <sample>   # re-check a kept workspace, no model calls
```

Each sample runs in a fresh temp workspace, which is kept and printed so you can
read what Forge wrote. The per-phase transcripts are saved in `docs/eval/`, and
any answer the simulated user didn't cover is logged in
`docs/eval/assumptions.md`.

**Cost.** Each transcript reports `total_cost_usd`: what the run would cost at
API prices (about $0.60–$0.90 for the samples without UI, more for the UI ones).
It is billed only when `claude` signs in with an API key. On a Claude
subscription it counts against your plan's usage limits instead, and with
overages off, a run past the limit stops rather than charges. Run only the
samples a change touches to keep that usage small.

## The samples

| Sample | Class | UI | What it exercises |
|---|---|---|---|
| `csv-dedupe` | throwaway | no | Architecture and design are skipped; no `qa` skill; minimal scaffold |
| `webhook-relay` | tool | no | The design phase refuses; `qa` maps flows and guards the riskiest assumption without UI checks; team fluency picks the stack |
| `bookclub-picks` | tool | app | Short design phase, motion lens, Playwright smoke + axe at tool scale, no cross-browser |
| `bakery-landing` | tool | marketing | Fixed brand values survive into `DESIGN.md`; static site gets no backend or database |
| `clinic-booking` | product | app + marketing | Full design with both surfaces, tenancy, EU residency, double-booking invariant, product-scale `qa` (WebKit, visual, keyboard) |
| `realtime-contradiction` | product | app | A self-contradicting scope: architecture escalates to scope, and design and build refuse |
| `studio-membership` | tool | app + marketing | Runs **with the design skills installed**: ui-ux-pro-max leads the app, taste-skill the public page, design-motion-principles the motion. Its generated e2e suite is run too |

Together they cover every size class, UI and no UI, both design surfaces, the
backward escalation path, and the path with external design skills installed. A unit test enforces that coverage, so a sample
can't be removed without it being noticed.

## Running the generated project

After build, the runner reads `docs/forge/commands.json`, which build writes, and
runs the generated project's own `install` and `test` commands in the workspace.
`test` must pass on a fresh clone with only the toolchain, so it always runs.
`integration` needs external services the sandbox doesn't have, so it is
recorded as skipped. `e2e` runs when the sample sets `harness.e2e`. If the
sandbox can't download the browser the project's Playwright pins, set
`EVAL_CHROMIUM` to a Chromium executable (Claude Code cloud containers have one
at `/opt/pw-browsers/chromium`, which is picked up automatically). The runner
then runs e2e through a wrapper config, `docs/eval/playwright.eval.config.ts`,
that changes only the browser executable. On a normal machine Playwright
downloads its own browser and none of this applies. The results go to
`docs/eval/verify.json`, and a non-zero exit fails the sample with the tail of
its output. This is what proves that "the harness is scaffolded and proven to
run" is true, not just claimed. These commands need network access for package
installs. E2E also needs a browser, which is why it is opt-in per sample.

## External design skills

A sample's `harness.plugins` lists plugins to install alongside Forge, each
pinned to a commit SHA so a run is reproducible. The runner clones each once
into `evals/.cache/plugins/` (gitignored) and loads it with `--plugin-dir`. A
repo with skills but no plugin manifest gets a minimal one. To move a pin, update
the SHA and re-run that sample.

## How a sample is built

```
projects/<name>/
  brief.md      the pitch plus the simulated user's answers and approvals: copied into the workspace
  expect.json   what correct looks like: never copied, so the phases can't read their own grading
  seed/         optional files to start the workspace with (e.g. an existing repo or brand assets)
```

`brief.md` must have `## Answers` and `## Approvals`. Answers follow the phases'
interview order; the eval harness tells each phase to read them instead of
asking, and to approve unless `## Approvals` says otherwise.

`expect.json`:

```jsonc
{
  "description": "one line: what this sample proves",
  "phases": ["scope", "architect", "design", "build"],   // run in order; a phase expected to refuse is still listed
  "harness": {                                           // optional; never shown to the phases
    "plugins": [{ "name": "taste-skill", "repo": "leonxlnx/taste-skill", "ref": "<40-char SHA>" }],
    "e2e": true                                          // also run the generated e2e command
  },
  "expect": {
    "sizeClass": "tool",
    "hasUI": true,
    "approvals": ["scope", "architecture", "design"],      // exactly these are stamped
    "escalation": null,                                    // or { "owner": "scope" }
    "skills": { "present": ["qa"], "absent": ["database"] },
    "files":  { "present": ["DESIGN.md"], "absent": [] },
    "contains":    [{ "file": "DESIGN.md", "pattern": "regex", "why": "the rule this proves" }],
    "notContains": [{ "file": "…", "pattern": "…", "why": "…" }]
  }
}
```

## What the checker verifies on every sample

From `src/check.ts`, beyond the sample's own expectations:

- `state.json` is valid, with the expected class, `hasUI`, approvals (ISO timestamps), and escalation (with owner, conflict, and proposal)
- Scope, architecture, and `DESIGN.md` have every section their **current** template has, with no template placeholder left unfilled. The headings are read from `references/templates/`, so the check follows template changes
- Each phase's output exists exactly when that phase should have produced it
- After build: `CLAUDE.md` and `docs/context/` exist; every generated skill has frontmatter and `## Lessons`; `CLAUDE.md` indexes every skill and links `DESIGN.md`; Playwright is set up if and only if UI is in scope; the `qa` flow map has a row for every v1 flow; `docs/forge/commands.json` has a `test` command (and `e2e` with UI), and every command the runner executed exited 0
- The phases could read Forge's own templates. A run where they couldn't fails as `harness`, because otherwise the model improvises and the run proves nothing

## Adding a sample

Add one when a change introduces a branch no sample takes: a new size-class
rule, a new surface, a new escalation trigger. Write the brief as a real user
would answer, and state each `contains` check's `why` as the rule it proves.
Then run it twice: a sample that passes once and fails once is checking the
model's mood, not Forge, so loosen the pattern or make the brief unambiguous.

## Reading a failure

- **`state.*`, `outputs`:** a gate or a phase transition is wrong. Check the phase skill's "Before starting" and "Next" sections.
- **`template:*`:** a phase skipped a template section, or the template changed and the skill didn't.
- **`build.*`, `skill`:** the build phase's generation rules.
- **`verify`:** the generated project's own install, test, or e2e command failed. The message ends with its output; the full workspace is kept.
- **`contains`:** a specific rule did not survive into the output; its `why` names the rule.
- **`harness`:** the eval setup, not Forge. Fix it before trusting anything else in the run.
