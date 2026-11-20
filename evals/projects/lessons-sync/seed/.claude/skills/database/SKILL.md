---
name: database
description: Standards for relay's SQLite schema, migrations, and data access. Use when changing migrations/ or internal/store.
---

# Database

- Migrations are numbered SQL files in `migrations/`, applied in order at start-up.
- All access goes through `internal/store`; no SQL elsewhere.

## Lessons

- Suggestion: set a busy timeout on every SQLite connection. (library: sqlite-busy-timeout)
- Store webhook payloads as the bytes received, never re-encoded. (library: keep-payload-bytes)
- Run VACUUM nightly to keep the database file small. (library: sqlite-vacuum-nightly)
- Timestamps are stored as UTC RFC 3339 text; compare them as strings only in that format (PR #2).
