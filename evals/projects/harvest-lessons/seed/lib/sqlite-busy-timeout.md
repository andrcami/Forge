---
id: sqlite-busy-timeout
scope: portable
status: observed
tags: ['stack:sqlite', 'skill:database']
evidence:
  - project: ledger
    ref: 'PR #31'
    date: '2026-07-02'
retired_reason: null
---
Set a busy timeout on every SQLite connection (`_busy_timeout=5000` in the DSN,
or `PRAGMA busy_timeout`). Without one, a second writer fails at once with
SQLITE_BUSY instead of waiting for the lock.

Evidence: two background jobs writing at the same moment failed one of them
with SQLITE_BUSY, which looked like random data loss.
