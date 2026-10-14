# SQLite, single node

**Scale band:** low-to-mid thousands of reads/sec and hundreds of writes/sec
on modest hardware for a well-tuned single writer; ceiling is the single
machine's disk and CPU, full stop.

## Fits

- Tools and internal apps with a small, bounded user base and no multi-region
  requirement — the entire database is a file; backup is `cp`
  hosting reliability, no separate DB service to provision, patch, or pay for
- Read-heavy workloads — WAL mode gives concurrent readers with a single
  writer, which covers a large share of real app traffic patterns
- Edge/embedded deployment (LiteFS, Turso, or a bundled desktop/mobile app) —
  the data travels with the process instead of needing a network round trip

## Loses

- Any workload with real concurrent write volume from multiple processes —
  SQLite serialises writers; a second process writing at the same time waits,
  and there is no getting around this by tuning
- Multi-region or multi-writer architectures — SQLite has no native
  replication model for that shape; LiteFS/Litestream bolt on
  single-primary replication, which is a different (and more constrained)
  guarantee than a networked RDBMS with real multi-node write support
- Large concurrent user counts hitting the same database file over a network
  filesystem — SQLite's locking assumes a local filesystem with correct
  `fsync`/locking semantics; NFS and some cloud filesystems violate this and
  produce silent corruption, not just contention
- Teams expecting Postgres-equivalent tooling — no native row-level security,
  weaker concurrent-migration story, no built-in replication or logical
  decoding; anything built assuming those exists needs to be re-thought

## Failure modes at 10× scale

- Writer contention becomes the ceiling directly — `SQLITE_BUSY` errors under
  concurrent writes if busy-timeout and retry logic are not deliberately
  built in from day one; this is invisible at low traffic and a wall at 10×
- Database file growth on a single disk becomes an I/O bottleneck with no
  horizontal escape hatch — the only scale-up path is a bigger disk and a
  bigger machine, not more nodes
- Long-running read transactions can block WAL checkpointing, causing the
  WAL file to grow unbounded until the read finishes — a slow analytics
  query on the same file as the live app is a common self-inflicted outage
- A backup/restore or replication step (Litestream, LiteFS) that was never
  drilled fails exactly when needed — single-file databases make backup feel
  solved, which is precisely what causes the restore path to go untested

## Ops burden

Very low at the intended scale — no separate DB service, trivial backup story
via file copy or Litestream continuous replication. The burden is not
day-to-day operations; it is the migration cost the day the single-writer
ceiling is actually hit and the project needs to move to a networked RDBMS.
