# Elixir + Phoenix

**Scale band:** thousands to hundreds of thousands of concurrent connections on
modest hardware; the BEAM is built for exactly this shape.

## Fits

- Massive numbers of long-lived connections — websockets, SSE, LiveView; each
  connection is a lightweight BEAM process, not an OS thread
- Fan-out — PubSub across a cluster is built in, not bolted on
- Soft-realtime systems that must degrade gracefully — a crashing process takes
  down one request, not the node, and supervisors restart it
- Teams building interactive UI without a separate frontend framework —
  LiveView removes the API layer for a large class of app

## Loses

- CPU-bound, single-threaded-hot-path work — numeric crunching, video encoding,
  tight-loop parsing. The BEAM schedules fairly across processes but is not
  fast per-instruction; reach for a NIF or a Rust port for the hot loop
- Hiring and onboarding — the talent pool is small, and OTP's process/supervisor
  model is a real paradigm shift for engineers coming from thread-per-request
  stacks. Budget weeks, not days, for a new hire to be productive
- Ecosystem breadth — for any given integration (a niche SaaS SDK, an obscure
  file format) there is a real chance no Elixir library exists and you are
  writing a port or an HTTP wrapper yourself
- Static typing — Dialyzer is a fragile, opt-in gradual-typing bolt-on, not a
  reliable compile-time guarantee; some categories of bug that a strict type
  system would catch surface at runtime instead

## Failure modes at 10× scale

- Mailbox growth — a process that cannot keep up with its inbox accumulates
  messages silently until memory blows up; this shows as gradual node memory
  growth with no obvious culprit until `:erlang.process_info` is checked
- ETS table growth in a long-running cache — unbounded ETS is easy to write and
  easy to forget to cap, and it is per-node memory, not shared
- Distributed Erlang's full-mesh clustering does not scale past dozens of nodes
  without a partitioning strategy (libcluster topologies, or moving off full
  mesh entirely)
- Postgres becomes the real bottleneck once the BEAM side is no longer it —
  connection-heavy LiveView deployments can exhaust the pool faster than a
  stateless HTTP stack would, because connections live as long as the socket

## Ops burden

Low-to-moderate. One BEAM runtime, hot code reload if wanted (rarely worth the
complexity), and Postgres. Clustering for multi-node PubSub adds real
operational surface — DNS-based or libcluster discovery, distribution cookies —
that a single-node deployment does not need.
