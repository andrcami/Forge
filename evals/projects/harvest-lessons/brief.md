# Brief — harvest-lessons

## Pitch

`relay` is a small internal Go service: it receives webhooks, verifies their
signatures, stores them in SQLite, and delivers them to internal consumers with
retries. The branch `delivery-hardening` fixed a batch of production problems
and is about to become PR #12. Harvest it.

## Answers

- **Project name for evidence:** `relay`.
- **PR reference for evidence:** `PR #12`.
- **Date for evidence:** today.
- **Anything else the harvest asks:** the branch's `docs/context/status.md` is
  the team's account of what happened; trust it.

## Approvals

- **Approve** a library lesson about verifying webhook signatures over the raw
  request body.
- **Approve** recording the SQLite busy-timeout problem in the library: it bit
  another project before this one.
- **Do not** add anything about Go's `http.Client` timeout, in the library or in
  the project's skills: the team treats it as common knowledge and doesn't want
  it recorded. Reject it if proposed.
- Project-skill edits (the `## Lessons` sections in `.claude/skills/`) are approved.
