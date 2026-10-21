---
name: setup
description: "Set up Forge on this machine — install its dependencies and connect the lesson library: an existing git repo, a new private GitHub repo created for you, or this machine only. Use on first install, on a new machine, when moving the library, or when forge reports it is not configured."
---

# Setup

Connects this machine to a lesson library, so the phases and the harvest can
read and write lessons. Everything here goes through the `forge` CLI (on the Bash
PATH while the plugin is enabled; otherwise `${CLAUDE_PLUGIN_ROOT}/bin/forge`).

Plugin settings, if the user filled them in when enabling Forge (change them
with `/config`):

- lesson repository: `${user_config.lessons_repo}`
- local clone: `${user_config.lessons_path}`

A value that is empty, or still reads as a `${user_config…}` placeholder, is not
set. Ask for it instead.

## 1. Dependencies

Run `forge store info`. If it says dependencies are not installed, offer to run
`npm install` in the plugin root (the message names the directory), then run it
again.

## 2. Where things stand

Show the `forge store info` output. Its `config:` line says where the setting
comes from: this project's `.forge.json`, the machine config, or nothing yet.

- **The project's `.forge.json` names a library that isn't cloned here** (a new
  machine, or a teammate's project): run `forge store init --project`. It clones
  what the file names. Then go to step 7.
- **A library is configured with no problems listed:** say so, and ask whether
  the user wants to change it. If not, stop here.

## 3. Shared or this machine only

Ask, one question at a time:

1. **Shared through git (recommended)** — lessons follow you to every machine
   and project. Or **this machine only** → `forge store init --local`, then
   step 6.
2. **For this machine, or just this project?** Machine is the usual answer.
   Choose **project** when one machine does work for different owners, e.g.
   personal projects and an employer's. The project's `.forge.json` then sends
   this project's lessons to its own library, and every other project keeps the
   machine's. Add `--project` in step 6. The file holds no secrets; suggest
   committing it, so teammates and other machines use the same library.
3. **Which repository** — `owner/name` on GitHub, or any git URL. Suggest
   `<their GitHub login>/forge-lessons` (`gh api user --jq .login` gives the
   login). For work, a repo owned by the employer, never a personal one: work
   lessons are the employer's information.
4. **Where to clone it** — suggest `~/dev/forge-lessons`.

## 4. Create the repository if it does not exist

Check with `gh repo view <owner/name>` (or `git ls-remote <url>` for a non-GitHub
URL).

If it does not exist, say exactly what will happen: "I'll create
`<owner/name>` on GitHub as a **private** repository." Create it only after an
explicit yes, by adding `--create` in step 5. Never create a public repository;
lessons hold real security findings.

If `gh` is not installed or not logged in (`gh auth status`), don't work around
it. Ask the user to create a private, empty repo at https://github.com/new and
continue once it exists.

## 5. Bring existing lessons along

Look for a library that already exists:

- the current config, if it points somewhere else (`forge store info`)
- `~/.claude/forge/lessons`, the default local library
- a `lessons/` directory in an older Forge clone

If one has lessons, offer to import them with `--import <dir>`. Project-scoped
lessons are skipped, and matching ids merge, as with any write.

## 6. Run it

```bash
forge store init --repo <owner/name|url> --path <dir> [--create] [--import <dir>] [--project]
```

If it reports that the config already points somewhere else, show the user the
current config and ask before rerunning with `--force`. The old config is kept
as `config.json.bak`.

The command clones the repo, seeds an empty one with `lessons/` and a README,
imports, pushes, writes `~/.claude/forge/config.json`, and prints
`forge store info`. A failure is reported as it is: don't retry by hand-running
git.

## 7. Confirm

Run `forge lessons list` and report the count. Suggest saving the repo and path
in the plugin settings (`/config`), so the next machine's setup is prefilled.

## 8. Chat style

Run `forge chat-style`. It shows whether the user chose a style, and whether
caveman is installed. If a choice is recorded, stop here.

Ask once: "Do you want caveman mode for chat? Answers get terse. Code, commits,
PRs, and Forge lessons stay normal." Then act on the answer.

- **No:** run `forge chat-style normal`. Forge does not ask again.
- **Yes, and the caveman plugin is not installed:** say what will happen.
  "I'll install the caveman plugin from its author's marketplace,
  `JuliusBrussee/caveman`. It is third-party code. It starts in every session."
  Install only after an explicit yes:

  ```bash
  claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman
  ```

  Do not use caveman's `npx` installer. It also changes other agents and how
  requests are sent. If the user is at work, ask whether third-party plugins are
  allowed before you install.
- **Yes, and the plugin is installed or enabled:** nothing to install.

Then ask for the level. **Full** is the plugin's default. **Lite** keeps full
sentences, so it reads more like normal text.

- **Full:** run `forge chat-style caveman`.
- **Lite**, or only the caveman skill is available (no plugin): run
  `forge chat-style caveman --level lite` (or `--level full`). This adds one
  marked line to `~/.claude/CLAUDE.md`, so caveman starts by default.
  `forge chat-style normal` removes the line.

Tell the user that the change takes effect in a new session. In chat, they can
say "stop caveman" at any time.
