---
id: sqlite-vacuum-nightly
scope: portable
status: retired
tags:
  - 'stack:sqlite'
  - 'skill:database'
evidence:
  - project: relay
    ref: 'PR #6'
    date: '2026-08-05'
retired_reason: 'VACUUM takes an exclusive lock for minutes on a large file and stopped deliveries; incremental auto-vacuum replaced it.'
---
Run VACUUM nightly to keep the SQLite file small.
