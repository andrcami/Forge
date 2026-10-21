---
name: database
description: Standards for relay's SQLite schema, migrations, and data access. Use when changing migrations/ or internal/store.
---

# Database

- Migrations are numbered SQL files in `migrations/`, applied in order at start-up.
- All access goes through `internal/store`; no SQL elsewhere.
- Payloads are stored as raw bytes (`BLOB`), never re-encoded.

## Lessons

- `deliveries.status` is not indexed yet: the pending-deliveries query scans the whole table (PR #4).
- Timestamps are stored as UTC RFC 3339 text; compare them as strings only in that format (PR #2).
