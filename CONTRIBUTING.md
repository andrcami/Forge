# Contributing to Forge

Contributions are welcome: bug fixes, new stack references, better templates,
new eval samples, and improvements to the phases.

## How it works

1. **Open an issue first** for anything larger than a small fix, so we can agree
   on the approach before you build it.
2. **Fork** the repository and work on a branch in your fork.
3. **Open a pull request** against `main`. Fill in the template.
4. **Review.** Every pull request is reviewed and approved by the maintainer
   (@andrcami) before it merges. CI must be green. Expect questions; Forge's
   skills are instructions, and small wording changes can change behaviour.

## Before you open the PR

```bash
npm ci
npm run verify                      # typecheck + tests
claude plugin validate --strict .claude-plugin/plugin.json
```

If you changed anything in `skills/` or `references/`, also run the eval
samples your change affects and paste the result in the PR:

```bash
npm run eval -- <sample>            # see evals/README.md
```

This uses your own Claude Code session, which counts against your plan's usage.

## Ground rules

- **No lessons in this repository.** The lesson library lives in each user's own
  private repo. Never include lesson files, client or project names, or
  findings from real codebases in code, docs, tests, or examples. Use invented
  examples.
- **Skills stay thin.** Generic know-how goes in `references/`, linked from a
  skill rather than copied into it.
- **Bump the version** in `.claude-plugin/plugin.json` when installed copies need
  your change. The plugin cache is keyed by version.
- **Keep PRs focused.** One concern per pull request.

## Licence

By contributing, you agree that your contribution is licensed under the MIT
licence in [LICENSE](LICENSE).
