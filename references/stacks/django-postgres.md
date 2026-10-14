# Django + Postgres

**Scale band:** tens to low thousands of RPS per node on modest hardware,
horizontally scalable behind a load balancer for more.

## Fits

- CRUD-heavy admin and back-office tooling — the built-in admin is a real
  productivity advantage nothing above matches out of the box
- Teams that need to move fast on data-model-centric apps with real
  relational invariants — the ORM and migration tooling are mature and
  battle-tested
- Regulated domains needing audit trails and permission scaffolding quickly —
  django-auth, django-guardian, and friends cover a lot of the boilerplate
- Solo founders and small teams — batteries-included means fewer decisions,
  and Python fluency is common on most teams

## Loses

- Any hard latency floor — the GIL and Python's interpreter overhead put a
  ceiling well above what Go, Rust, or even Node reach; per-request cost is
  materially higher across the board
- High-concurrency long-lived connections — Django's sync core (WSGI) handles
  this poorly; Channels/ASGI exists but is a second, less-battle-tested
  runtime model bolted onto a framework designed around request/response
- CPU-bound work in the request path — the GIL serialises it; anything
  numerically heavy needs to leave the process (Celery worker, or a service
  boundary to compiled code) or it blocks the whole worker
- Large monolith codebases over years — Django does not push much structure
  beyond apps/models/views, so a big Django codebase without discipline
  degenerates into a tangle of cross-app imports and fat models

## Failure modes at 10× scale

- The ORM generates N+1 queries by default; `select_related`/
  `prefetch_related` are opt-in, and a query that was fine at low traffic
  becomes the top of the flame graph without any code change
- Gunicorn/uWSGI worker-per-request means memory scales with concurrent
  requests, not with actual work done; a slow downstream call (an API, a
  report) ties up a whole worker process, not a lightweight coroutine
- Migrations that lock a large table (`ALTER TABLE ADD COLUMN` with a default
  on old Postgres, or an index build) become a production outage waiting to
  happen once a table has grown past the point where a lock is cheap
- Celery becomes its own operational subsystem at scale — broker choice,
  worker autoscaling, task retries and idempotency all become load-bearing,
  and most of that risk is invisible until a burst of tasks piles up

## Ops burden

Moderate. WSGI app servers plus a process manager, Postgres, and — the moment
anything needs to run out of request — a Celery worker fleet and a broker
(Redis or RabbitMQ). The admin and ORM buy velocity; the runtime model is the
part that costs at scale.
