# Next.js + Postgres

**Scale band:** low-to-mid thousands of RPS on serverless/edge platforms for
stateless routes; considerably less once a route needs a durable DB
connection per invocation.

## Fits

- Content- and marketing-heavy sites needing SEO — server rendering and
  static generation are first-class, not an afterthought
- Teams that are already React/TypeScript-fluent and want one language and
  one repo across frontend and a thin backend
- Apps where the UI is the product and the backend is mostly CRUD glue —
  API routes/Server Actions cover that without a second service
- Fast iteration on the presentation layer — hot reload, a huge component
  ecosystem, and a design-system-friendly rendering model

## Loses

- Anything with real backend complexity — a payment saga, a job queue, a
  domain model with non-trivial invariants. API routes are handlers, not an
  application architecture; there is no natural home for domain logic and
  teams either invent one or let it leak into route files
- Long-lived connections and stateful backends — the serverless/edge deploy
  model most Next.js apps run on is built around short-lived, stateless
  invocations. Websockets, in-process caches, and background workers do not
  fit the model and need a separate service anyway
- Direct Postgres connections from serverless functions — each cold-started
  function instance wants its own connection, and function count scales with
  traffic, not with a fixed pool; this is a well-known failure mode requiring
  a pooler (PgBouncer, Neon/Supabase pooling) as a hard requirement, not an
  optimisation
- Using it as the whole backend for a data-heavy or compute-heavy product —
  the moment there is real server-side work (queues, scheduled jobs, heavy
  computation), Next.js is doing frontend-and-glue while the actual backend
  lives somewhere else, and that split is often unplanned

## Failure modes at 10× scale

- Connection exhaustion on the database from serverless function fan-out —
  this is the single most common Next.js-at-scale incident, and it happens
  well before the database's CPU or the app's compute is the bottleneck
- Cold starts under bursty traffic add tail latency exactly when a spike
  needs the opposite; edge runtimes mitigate this but come with their own
  restricted Node API surface, so getting there is not free
- Revalidation and caching layers (ISR, fetch cache) are easy to get subtly
  wrong — stale reads or cache stampedes under load are common and hard to
  reproduce locally, since local dev does not replicate the production CDN
  cache behaviour
- Server Actions and API routes with no shared validation/auth layer drift —
  each new route re-implements auth checks unless the team enforces a
  middleware pattern, and that drift surfaces as an inconsistent security
  posture, not a crash

## Ops burden

Low if deployed to a managed platform (Vercel or similar) for the frontend;
moderate the moment real backend work needs a separate service, a queue, or
a scheduled-job runner, because none of that is native to the framework and
each piece is a distinct operational surface bolted on next to it.
