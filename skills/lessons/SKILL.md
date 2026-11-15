---
name: lessons
description: Read, search, import, sync, dedupe, retire, and purge lessons in the Forge library. Use when backfilling lessons from an existing repo, reviewing what the library holds, pulling new library lessons into an existing project, merging lessons that say the same thing, retiring a lesson that turned out wrong, or clearing project lessons.
---

# Lesson library

The library holds **portable** lessons — those that would bite the next project
regardless of stack, or that are tagged to the stack they apply to. Project-specific
lessons stay in their own repo.

## The two axes

A lesson carries two independent classifications. Conflating them is the mistake
this design exists to avoid.

- **`scope:`** — `project` or `portable`. Decides **where it is stored**.
- **`tags:`** — `stack:go`, `skill:database`, `domain:webhooks`, `platform:windows`.
  Decides **when it loads**.

Every portable lesson carries a `skill:` tag naming the concern skill it belongs
to. That tag is what routes a lesson into the right generated skill in the next
project.

## Load rules

- `confirmed` matching tags load **as rules**
- `observed` load **as suggestions**, flagged as such
- `retired` load only when something proposes re-adding the same lesson, and
  surface as "tried this, did not hold, here is why"

The retired tier is what stops the same wrong idea being relearned. It is the
half of the library that records what does **not** work.

## Commands

### `import <path>`

Read an existing repo's `.claude/skills/**` and propose portable candidates.
For each: show the lesson, the proposed tags, and the proposed status. Rewrite
the lesson in Simplified Technical English first (`references/writing/ste.md`)
and run `forge lessons check <file>` on it. **Approve
per entry** — nothing is written unseen. A lesson that has demonstrably bitten
twice may enter as `confirmed`; everything else enters `observed`. Write each
approved entry with `forge lessons write <file>`.

Filter out what is not portable: project-specific schema, design tokens, one-off
branch trivia. When unsure, leave it in the project — wrong-but-local beats
wrong-and-global.

### `list [--tag <t>]`

`forge lessons list [--tag <t>]` — the library, `confirmed` first, `retired`
last. The `store` skill has the full CLI and where it lives.

### `search <words>`

`forge lessons search <words>` — lessons ranked by how many of the words they
hold (id, tags, and body). Use it to answer "do we already know this?".

### `sync`

Bring an existing project's skills up to date with the library. Build seeds each
generated skill's `## Lessons` once; lessons learned in other projects after that
never arrive unless something pulls them. This command does.

1. Read the stack from `docs/forge/architecture.md` (or ask, if there is none).
2. For each `.claude/skills/<concern>/SKILL.md` with a `## Lessons` section, run
   `forge lessons list --tag skill:<concern> --stack <s>... --json`.
3. Compare by the `(library: <id>)` marker at the end of each seeded line.
   Match the ids **and the aliases** of each library lesson, because a merge
   can rename a lesson. Propose, per skill:
   - **add**: `confirmed` or `observed` lessons the skill does not hold yet;
   - **promote**: lines seeded as suggestions whose lesson is now `confirmed`;
   - **remove**: lines whose lesson is now `retired`, with the retired reason;
   - **rename**: lines that name an id which is now an alias, to the new id.
   Leave lines without a `(library: …)` marker alone: they are project lessons.
4. Show the full proposal, then **approve per skill**. Write only the approved
   lines, in the format Build uses: the rule, then `(library: <id>)`, with
   `observed` ones marked as suggestions.

Sync writes only to the project's skills. It never writes to the library.

### `dedupe`

Find lessons that state the same rule and fold each group into one.

1. `forge lessons similar` lists pairs of active lessons with a similarity score
   from 0 to 1, best first. The default cut-off is 0.35. Use `--min 0.25` to look
   wider, and `--tag`/`--stack` to dedupe one area at a time.
2. The score only finds candidates. Read both lessons (`forge lessons read <id>`)
   and decide: **same rule** (merge), **one rule is a special case of the other**
   (usually keep both, and make the narrower one say so), or **different rules
   with shared words** (keep both).
3. For each group to merge, write one lesson file in Simplified Technical English.
   Keep the clearest rule sentence and the strongest evidence text. Use the id
   that best names the rule, which can be one of the old ids. Start the tags from
   all the sources' tags, then remove each one that is wrong for the merged rule
   (for example `stack:any` on a rule that only holds for Python): the file's
   tags are the merged lesson's tags. Run `forge lessons check <file>`.
4. Show each proposed merge — the old lessons side by side and the new text —
   and **approve per group**.
5. On approval: `forge lessons merge <file> --from <id> --from <id>...`. The CLI
   adds the evidence of every source, keeps the old ids as aliases, removes
   their files, and commits the change once. It prints the source tags that the
   file left out; check that each one was meant to go. A lesson becomes `confirmed` when
   the merged evidence spans two projects, or a source was already confirmed.
   Report the CLI's output line.

The CLI refuses to merge a `retired` lesson with an active one: the retired one
records what did not hold. Retire the others instead, or keep them apart.

After a dedupe, run `forge lessons tags`. For each pair of tags it flags, pick
one, show the change, and on approval run `forge lessons retag <old-tag> <new-tag>`:
it renames the tag on every lesson in one commit. To fix the tags of a single
lesson, merge it into itself with the right tags
(`forge lessons merge <file> --from <its id>`).

### `retire <id> --reason "<why>"`

`forge lessons retire <id> --reason "<why>"`.

**The preferred operation when a lesson turns out wrong.** The entry stays
visible with its reason, so the next session learns what was tried.

### `purge --project`

Clear `## Lessons` sections in the current repo's skills. The library is
untouched.

### `purge --library --tag <t>`

Tag-scoped library purge. Requires typed confirmation. Prefer `retire` — purging
discards the negative knowledge the library exists to keep. The library is a git
repo, so a purge is recoverable; say so when confirming rather than making it
sound irreversible.

The CLI has no purge command, on purpose. After typed confirmation, list the
matches with `forge lessons list --tag <t>`, then in the store's clone (`forge
store info` shows where) `git rm` exactly those files, commit with a `lessons:
purge <tag>` message, and push. Never stage anything else.

## Rules

- **Nothing is written to the library without the user seeing it.** A library
  that writes itself unattended drifts.
- **Ambiguous scope defaults to `project`.**
- **Prune in the same pass as you write.** A lesson describing a since-closed
  state is worse than no lesson.
