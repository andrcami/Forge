# CLAUDE.md — <project>

<One-paragraph description of what this is, from the scope doc.>

## Session start

1. Read `docs/context/status.md` — current state, in-flight work, next steps.
2. Skim the skills index below and load those matching this session's work.
3. For anything architectural, `docs/forge/architecture.md` is binding.
4. For anything visual, `DESIGN.md` is binding (when the project has UI).

## Skills index (`.claude/skills/`)

| Skill | Use for |
|---|---|
<!-- One row per generated concern skill. -->

## Commands

```bash
<!-- The exact commands for this stack. -->
```

## Authority order (when documents disagree)

1. **`docs/forge/architecture.md`** — the binding architecture decision
2. **`DESIGN.md`** — the binding design decision, for anything visual
3. **`docs/context/decisions.md`** — decisions made since
4. **`docs/forge/scope.md`** — what is and is not being built

## Non-negotiable rules

<!-- Carried from the architecture decision's binding decisions. -->

## Session end

Update `docs/context/status.md` in the same PR as the work. Run the harvest
(`/forge:harvest`) before opening the PR.
