---
name: database
description: Standards for relay's SQLite schema, migrations, and data access. Use when changing migrations/ or internal/store.
---

# Database

- Migrations are numbered SQL files in `migrations/`, applied in order at start-up.
- All access goes through `internal/store`; no SQL elsewhere.
- Payloads are stored as raw bytes (`BLOB`), never re-encoded.

## Lessons

- Always put a `LIMIT` on queries that filter `deliveries` by `status`: the column has no index, and an unbounded scan holds the write lock for seconds (PR #4).
- Timestamps are stored as UTC RFC 3339 text; compare them as strings only in that format (PR #2).
