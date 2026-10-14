# Context memory

Any session — human or agent — should cold-start from these files without
replaying old conversations.

- `status.md` — current state, in flight, next. Rewritten, not appended.
- `decisions.md` — one entry per decision. Appended, never rewritten.

Memory updates ship in the same PR as the work they describe. Stale memory is
worse than no memory.
