# Go + Postgres

**Scale band:** hundreds to tens of thousands of RPS on modest hardware.

## Fits

- High-throughput CRUD and API work where per-request cost matters
- Long-lived connections — goroutines make websockets cheap
- Teams that value a small language surface and fast onboarding
- Single static binary deploys; no runtime to install

## Loses

- Rich domain modelling — no sum types, no generics-heavy abstractions without
  friction. Complex invariants become verbose
- Rapid CRUD scaffolding — there is no Rails or Django admin equivalent; expect
  to write more by hand
- Teams with no Go fluency and a tight deadline; the language is small but the
  ecosystem conventions are not obvious

## Failure modes at 10× scale

- Connection pool exhaustion before CPU saturates — size the pool against
  Postgres `max_connections`, not against goroutine count
- `context` cancellation not plumbed through, so load sheds badly under pressure
- N+1 queries hide well because each is fast; they surface as a cliff, not a slope

## Ops burden

Low. Static binary, no runtime, straightforward containerisation. Postgres is the
only stateful component.
