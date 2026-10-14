# Forge

A Claude Code plugin that drives a project from scope through architecture into
development — and accumulates what it learns across every project it touches.

The lesson library is not in this repository. Each context (personal, each
employer) keeps its own private lesson repo, connected with `/forge:setup`.

## Phases

| Command | Phase | Output |
|---|---|---|
| `/forge:scope` | 1 — Scope (product) | `docs/forge/scope.md`: problem, users, first release, riskiest assumptions, surfaces, size class |
| `/forge:architect` | 2 — Architecture | `docs/forge/architecture.md`, stack decision |
| `/forge:design` | 3 — Design (UI only) | `DESIGN.md`, visual + motion direction, lead design skills |
| `/forge:build` | 4 — Build | generated skills (incl. design-system, qa), test harness incl. Playwright, `docs/context/`, `CLAUDE.md` |
| `/forge:harvest` | ongoing | lessons folded back into skills and the library |
| `/forge:lessons` | ongoing | import, list, retire, purge |

Ceremony scales with the size class set in phase 1: a `throwaway` skips
architecture and design entirely; a `product` gets the full comparison and the
full gate list. The design phase runs only when a surface has user-facing UI.

### Design skills

The design phase and the generated `design-system` skill detect and wire these
when installed, and fall back to built-in rules when not. Install the ones that
match your surfaces:

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill   # app UI, tokens, stack UI rules
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
/plugin marketplace add Leonxlnx/taste-skill                   # marketing / public pages
/plugin install taste-skill@taste-skill
npx skills add kylezantos/design-motion-principles             # motion create + audit
```

### QA

Build generates a `qa` skill for every non-throwaway project: the test layers for
the chosen stack, a flow-to-test map built from the scope's core flows, and — when
UI is in scope — Playwright e2e plus accessibility (axe), keyboard, visual
regression, and reduced-motion checks at the breakpoints `DESIGN.md` names. The
harness is scaffolded and proven to run before the first feature. Recipes are in
`references/qa/`.

Reference `DESIGN.md` files from
[awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design) serve as
starting structure when a project has no brand. Which skill leads which surface,
and why, is in `references/design/skills.md`.

Phases gate forward and escalate backward. A discovered contradiction sends work
back to the phase that owns it rather than being worked around.

## The lesson library

Lessons carry two independent classifications:

- **`scope:`** — `project` (stays in that repo) or `portable` (enters the library)
- **`tags:`** — `stack:go`, `skill:database`, `domain:webhooks`, `platform:windows`

`confirmed` lessons load as rules, `observed` as suggestions, `retired` only when
something proposes re-adding them — which is how the library records what does
**not** work.

## Install

This repo is its own single-plugin marketplace, so you add it once as a
marketplace, then install the `forge` plugin from it. Pick the route that matches
where you use Claude Code. All three install to the same place, so a plugin
installed one way shows up in the others.

### Prerequisites

- **git:** Claude Code fetches the marketplace with it.
  On Windows, install [Git for Windows](https://git-scm.com/download/win)
  (`winget install --id Git.Git -e`); Claude Code also uses its Git Bash to run
  commands there.
- **Node.js 20+:** Forge's `forge` command runs on it
  (`winget install --id OpenJS.NodeJS.LTS -e` on Windows).
- **GitHub CLI (`gh`)** (optional): lets `/forge:setup` create your lesson repo
  for you (`winget install --id GitHub.cli -e`, then `gh auth login`).

Open a new terminal after installing, so the new commands are found.

### Option A: Claude Code in the terminal

Start `claude`, then:

```
/plugin marketplace add andrcami/Forge
/plugin install forge@forge
```

### Option B: from a shell, without starting Claude

Use this route in any terminal, including where `/plugin` isn't available in the
chat:

```bash
claude plugin marketplace add andrcami/Forge
claude plugin install forge@forge
claude plugin list          # forge@forge should show as enabled
```

If `claude` isn't found, install the CLI with `npm install -g @anthropic-ai/claude-code`.

### Option C: VS Code or the desktop app (Manage Plugins)

1. Open **Manage Plugins** → **Marketplaces**.
2. Enter `andrcami/Forge` (or `https://github.com/andrcami/Forge`) and click **Add**.
3. Switch to **Plugins**, find **forge**, and install it.
4. Reload the window. In VS Code: Ctrl/Cmd+Shift+P → *Developer: Reload Window*.

If the chat replies "`/plugin` isn't available in this environment", use this
dialog or Option B instead.

### Then: connect your lesson library

When the plugin is enabled, Claude Code asks for two optional settings: the
lesson library repository (`owner/name` or a git URL) and where to clone it.
Leave them blank if you're unsure. Then run:

```
/forge:setup
```

It installs the plugin's dependencies, then connects a lesson library:

- **an existing repo**: it is cloned;
- **a new private GitHub repo**: created for you via `gh`, only after you confirm;
- **this machine only**.

It can also bring lessons from an older library along, and it writes
`~/.claude/forge/config.json`. Until setup has run, a session-start check
reminds Claude to suggest it once.

**Updating:** `/plugin marketplace update forge`, then `/plugin update forge@forge`
(or `claude plugin marketplace update forge` and `claude plugin update forge@forge`
from a shell, or **Manage Plugins**). Use one lesson repo per context:
for work, a repo owned by the employer.

**One machine, several contexts:** choose "just this project" in setup. It writes
a `.forge.json` to the project that sends that project's lessons to its own
library, e.g. an employer's. Other projects keep the machine's library. Commit
the file: on another machine, `/forge:setup` clones what it names.

### The lesson library

Lessons belong in their own private repository. Every read and
write goes through the plugin's CLI, `forge` (on the Bash PATH while the plugin
is enabled):

```bash
forge store info                     # what is configured, and any problems
forge lessons list --any-tag 'stack:*'
forge store init --repo me/forge-lessons --path ~/dev/forge-lessons [--create]
```

Each write is validated, merged with an earlier sighting, committed alone, and
pushed; a failed push is an error.

## Development

```bash
npm test        # vitest
npm run verify  # typecheck + test
npm run forge -- lessons list   # the CLI, from the repo
npm run eval    # framework QA: run the phases on the sample projects (uses claude -p)
```

Run `npm run eval` before merging any change to `skills/` or `references/`. The
sample projects and what each one proves are described in `evals/README.md`.

## Design

`docs/superpowers/specs/2026-08-31-forge-framework-design.md`

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md); every pull
request is reviewed by the maintainer before it merges.

## Licence

[MIT](LICENSE)
