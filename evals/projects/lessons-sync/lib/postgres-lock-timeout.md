---
id: postgres-lock-timeout
scope: portable
status: confirmed
tags:
  - 'stack:postgres'
  - 'skill:database'
evidence:
  - project: ledger
    ref: 'PR #52'
    date: '2026-09-01'
  - project: inventory
    ref: 'PR #9'
    date: '2026-10-25'
retired_reason: null
---
Set lock_timeout before each schema migration on PostgreSQL. A migration that waits on a lock queues every query behind it.
