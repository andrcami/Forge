---
name: backend
description: Standards for relay's HTTP handlers, signature verification, and delivery workers. Use when changing anything under internal/receive or internal/deliver.
---

# Backend

- Handlers live in `internal/receive`; delivery workers in `internal/deliver`.
- A request that fails signature verification gets 401 and is not stored.
- Delivery retries with exponential backoff, capped at 10 attempts.
- Errors are wrapped with `fmt.Errorf("...: %w", err)`; never swallowed.

## Lessons

- Consumers dedupe on the `X-Relay-Delivery` header, so redelivery is safe (PR #3).
