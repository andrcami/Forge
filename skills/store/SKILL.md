---
name: store
description: "The lesson store — how Forge reads and writes the portable lesson library through the forge CLI. Use when a skill needs to list, read, write, or retire lessons, or when diagnosing store configuration."
---

# Lesson store

Every lesson read and write goes through the `forge` CLI. **Never edit lesson
files or run git in the store yourself** — the CLI does what a hand edit forgets:
pull before reading, validate, merge a second sighting, commit only the lesson
directory, and fail loudly when a push fails.

## Running it

While the plugin is enabled, `forge` is on the Bash PATH. If it is not found,
call it by path: `${CLAUDE_PLUGIN_ROOT}/bin/forge`. It runs from any directory.

If it reports that dependencies are not installed, or `forge store info` shows
no library configured, run `/forge:setup`.

## Commands

```bash
forge lessons list [--tag <t>]... [--any-tag <t>]... [--status <s>]... [--json]
forge lessons read <id> [--json]
forge lessons check <file.md>
forge lessons write <file.md>
forge lessons retire <id> --reason "<why>"
forge store info [--json]
forge chat-style [caveman|normal] [--level lite|full] [--json]
forge store init --repo <owner/name|git-url> --path <dir> [--create] [--import <dir>] [--force]
forge store init --local [--path <dir>] [--import <dir>] [--force]
```

- `--tag` must all match, `--any-tag` needs one match, and a trailing `*`
  matches a namespace: `--any-tag 'stack:*' --any-tag 'arch:*'`. Quote patterns
  with `*` so the shell does not expand them.
- `list` sorts `confirmed`, then `observed`, then `retired`.
- `check` validates a lesson file and prints style warnings (Simplified Technical
  English, `references/writing/ste.md`) without writing anything. `write` prints
  the same warnings; neither blocks on them.
- `write` takes a lesson file — frontmatter plus body, the same format as the
  library's files. Write it to a temp file first; the CLI validates it before the
  library is touched and prints what happened: `added`, `promoted`, or `updated`.
- Exit code 0 is success, 1 an error (message on stderr), 2 a usage mistake.

A lesson file:

```markdown
---
id: kebab-case-id
scope: portable
status: observed
tags: ['stack:any', 'skill:database', 'domain:security']
evidence:
  - project: <repo name>
    ref: 'PR #12'
    date: 'YYYY-MM-DD'
retired_reason: null
---
The rule, stated so someone could follow it. Then the evidence: what happened,
and why the rule prevents it.
```

## Backends

Configured at `~/.claude/forge/config.json`; `forge store info` shows what is in
effect and flags problems.

| Backend | Use | Behavior |
|---|---|---|
| `local` | single machine, no sharing | plain directory |
| `git` | the default for real use | pull before read, commit + push after write |

```json
{ "store": { "backend": "git",
             "path": "~/dev/forge-lessons",
             "remote": "git@github.com:<owner>/forge-lessons.git",
             "subdir": "lessons" } }
```

`path` is a working clone of the lessons repository, `subdir` the directory in it
that holds the lessons.

**Per project:** a `.forge.json` with the same shape, in the project or any
parent up to the home directory, overrides the machine config for that project.
That is how one machine keeps an employer's lessons apart from personal ones.
`forge store info` shows which file is in effect. Run `forge` from inside the
project, which is where Bash already is, so the right library is used. With no config file the store runs `local` at
`~/.claude/forge/lessons`. `/forge:setup` writes this file through
`forge store init`; don't hand-edit it.

## Rules

- **Only `scope: portable` lessons enter the library.** A `scope: project` lesson
  belongs in that repo's `.claude/skills/*/SKILL.md` under `## Lessons`. The CLI
  rejects a project-scoped write rather than storing it in the wrong place.
- **A failed push is an error, never a warning.** A lesson committed but never
  pushed is invisible to every other project. Report it to the user; do not retry
  by hand-running git.
- **Lesson commits are prefixed `lessons:`** and contain nothing but lesson files.
- **Validation happens at write, not at load.** A malformed lesson never enters
  the library, so no reader has to defend against one.
