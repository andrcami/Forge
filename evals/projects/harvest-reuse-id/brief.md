# Brief — harvest-reuse-id

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

- **Approve** a library lesson about verifying webhook signatures over the
  request body as received.
- **Do not** add anything about SQLite or about Go's `http.Client` timeout to
  the library. Reject those if proposed.
- Project-skill edits (the `## Lessons` sections in `.claude/skills/`) are approved.
