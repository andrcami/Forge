# Discriminators — the questions that separate stacks

Ask only those the scope leaves open. Each entry states what the answer rules in
or out, so a question with no discriminating power is skipped.

## Concurrency shape

Request/response, long-lived connections, or fan-out?

- **Request/response** — every stack qualifies; this discriminates nothing on its
  own, so move on quickly
- **Long-lived connections** (websockets, SSE at scale) — favours Elixir, Go,
  Rust; penalises PHP and short-lived-process models
- **Fan-out** (one event, many recipients) — strongly favours Elixir/OTP or Go
  with a broker; a thread-per-connection model becomes the bottleneck

## Latency budget

A floor or an average? A p99 requirement is a different constraint from a mean.

- **Hard floor under 10ms** — Rust, Go, C++; rules out GC-pause-sensitive stacks
  at the tail
- **Sub-second average** — nearly everything qualifies
- **Human-scale (seconds)** — latency is not discriminating; optimise for team
  velocity instead

## Data model

Relational, document, graph, time-series, or blob-heavy?

- **Relational with real invariants** — Postgres, and prefer a stack with a mature
  migration story
- **Time-series at volume** — ClickHouse, TimescaleDB; a general RDBMS will hurt
- **Graph traversal central** — Neo4j or a graph extension; a self-join chain in
  SQL is a warning sign
- **Blob-heavy** — object storage plus a metadata DB; do not put blobs in the RDBMS

## Scale band, and plausible peak

Ask both. They are different questions and the gap between them is the design.

- Steady-state RPS or concurrent users
- Plausible peak — a launch, a seasonal spike, a viral moment
- A 100× gap between them means autoscaling or queueing is architectural, not an
  optimisation

## Team

Size, and existing language fluency.

- **Solo or pair** — team fluency dominates every other consideration. A stack the
  team knows beats a theoretically better one they do not
- **No ops capacity** — rules out anything needing cluster management; favours
  managed Postgres and a single deployable

## Regulated or PII data

- **Regulated** (health, financial, minors) — audit trail and retention become
  architectural; favours stacks with mature audit tooling
- **PII at all** — data residency may constrain hosting before it constrains stack

## Realtime, offline, mobile

- **Realtime UI** — favours Phoenix LiveView, or a stack with a first-class
  websocket story
- **Offline-capable client** — sync and conflict resolution are the hard part;
  this is a data-model decision, not a stack one
- **Mobile clients** — API-first; rules out server-rendered-only designs

## ML in the request path

- **Yes** — Python in the serving path, or a service boundary to it. Do not
  contort the whole stack around it; isolate it
- **Batch only** — not discriminating; run it out of band

## Deploy constraints

VPS, serverless, on-prem, air-gapped?

- **Air-gapped or on-prem** — rules out managed-service-dependent designs
- **Serverless** — penalises long-lived connections and warm in-process state
- **Single VPS** — favours one deployable and an embedded or co-located DB
