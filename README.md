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

### Lesson checkpoints

You don't have to remember to ask Forge to learn. Once a library is configured,
a Stop hook asks Claude every 5 turns to look back over the conversation —
corrections, mistakes it fixed, surprising tool behaviour, rules you stated — and
propose any lessons worth keeping. It still writes nothing without your approval,
and says nothing when there is nothing to propose.

Change the interval with `lessonCheckpointEvery` in `~/.claude/forge/config.json`
(or a project's `.forge.json`); `0` turns checkpoints off.

## Install

This repo is its own single-plugin marketplace:

```
/plugin marketplace add andrcami/Forge
/plugin install forge@forge
```

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

Update later with `/plugin update forge@forge`. Use one lesson repo per context:
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
