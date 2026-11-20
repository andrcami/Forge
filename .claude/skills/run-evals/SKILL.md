---
name: run-evals
description: Run Forge's eval samples locally and commit the eval receipt. Use before opening or merging a PR that changes skills/, references/, hooks/, or evals/, when CI says the eval receipt does not cover the change, or when the user asks to run the evals.
---

# Run Forge's evals

Forge is instructions, and instructions regress silently. The evals run real
Forge phases with `claude -p` on sample projects and grade what they produce
(`evals/README.md`). They run here, on this machine, through the user's own
Claude Code, so CI never needs a model key. CI only checks the receipt:
`evals/receipt.json`, which records that every sample passed against exactly
the files being merged.

## When to run them

- **While working:** run only the samples the change touches, to keep usage low.
  A change to `skills/harvest` or `skills/lessons` needs the library samples
  (`harvest-*`, `lessons-*`); a change to one phase needs the samples that run
  that phase (the table in `evals/README.md`).
- **Before the PR merges:** every sample must have passed against the final
  files. `npm run eval:receipt` lists what is missing or stale.

## How to run them

1. Tell the user what will run and that it uses their Claude plan's usage (or
   API spend, when `claude` is signed in with an API key): about $0.60–$0.90 a
   sample at API prices without UI, more with UI. Ask before running the whole
   set; a few named samples need no question.
2. Run `npm run eval -- <sample> [<sample>…]` in the background, because a
   sample takes several minutes. Run nothing that edits `skills/`, `references/`,
   `hooks/` or `evals/` while it runs: the receipt is for the files as they are
   at the end.
3. Read the result. Each FAIL line names the check and the workspace path; the
   phase transcripts are in that workspace's `docs/eval/`. Find the cause in
   the instructions, not in the sample: change a sample's `expect.json` only
   when the expectation itself is wrong, and say so.
4. After a fix, run the failed samples again. A change to any digested file
   resets the receipt, so before the merge run every sample once more against
   the final files.
5. Run `npm run eval:receipt`. When it reports the receipt as current, commit
   `evals/receipt.json` with the change.

## Rules

- Never edit `evals/receipt.json` by hand. It is the record that the evals
  passed; a hand-edited one makes CI green on untested instructions.
- `--yolo` and `--no-verify` runs are for debugging and do not update the receipt.
- Report each sample's PASS or FAIL as the runner printed it. If a run was
  stopped or did not finish, say that it did not run.
