# Rust + Axum

**Scale band:** tens of thousands to hundreds of thousands of RPS on modest
hardware; ceiling is close to the hardware's, not the framework's.

## Fits

- Hard p99 latency floors — no GC pause, predictable allocation behaviour
- CPU- and memory-bound work where every allocation matters — parsers, codecs,
  proxies, anything on the hot path of a larger system
- Long-running services where memory safety without a GC materially reduces a
  whole class of production incident (use-after-free, data races)
- Single static binary deploys, minimal attack surface, low idle resource cost

## Loses

- Iteration speed on a product with an unsettled domain model — the borrow
  checker taxes exploratory refactors heavily; changing a data shape ripples
  through lifetimes and trait bounds in a way a GC'd language does not feel
- Teams without a Rust owner — the learning curve is not cosmetic. Async Rust
  specifically (`Send` bounds, pinning, executor quirks) trips up experienced
  Rust developers, not just newcomers
- CRUD-heavy admin/back-office work — the ecosystem has ORMs (sqlx, sea-orm,
  diesel) but nothing with Django-admin or Rails-scaffold levels of "generate
  it and move on"; every endpoint is hand-written and type-checked
- Time-to-first-working-version — compile times and the type system both slow
  the first draft, even though they pay off on the tenth revision

## Failure modes at 10× scale

- Async runtime misuse — blocking a Tokio worker thread with synchronous I/O
  or CPU work stalls every task scheduled on that thread, not just the
  offending request; this is invisible until load reveals it
- Unbounded channels (`mpsc` without a bound) turn backpressure problems into
  memory-growth problems instead of visible queueing
- Connection pool and Postgres tuning still applies — Rust's speed on the
  application side does nothing for the database being the bottleneck, and a
  faster app server can push more concurrent connections at Postgres than a
  slower one would, reaching `max_connections` sooner
- Panic-on-unwrap in a request handler that was fine in testing becomes a
  live incident under adversarial or malformed input at scale; `unwrap()` left
  in from a prototype is a landmine

## Ops burden

Low once built — static binary, small container, no runtime dependency. The
cost is front-loaded into development, not operations: longer CI compile
times, and a smaller bench of engineers who can safely touch the async
internals under incident pressure.
