---
id: sqlite-wal-for-concurrent-readers
scope: portable
status: confirmed
tags:
  - 'stack:sqlite'
  - 'skill:database'
evidence:
  - project: ledger
    ref: 'PR #40'
    date: '2026-08-11'
  - project: inventory
    ref: 'PR #5'
    date: '2026-10-20'
retired_reason: null
---
Turn on WAL mode for a SQLite file that a reader and a writer share. In the default rollback mode, a long read blocks every write.
