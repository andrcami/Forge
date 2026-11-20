---
id: sqlite-busy-timeout
scope: portable
status: confirmed
tags:
  - 'stack:sqlite'
  - 'skill:database'
evidence:
  - project: ledger
    ref: 'PR #31'
    date: '2026-07-02'
  - project: relay
    ref: 'PR #12'
    date: '2026-10-03'
retired_reason: null
---
Set a busy timeout on every SQLite connection. Without one, a second writer fails at once with SQLITE_BUSY instead of waiting for the lock.
