# Brief — webhook-relay

## Pitch

Our team receives webhooks from Stripe and GitHub and needs a small internal
service that verifies their signatures, stores them, and fans each one out to
two internal consumers with retries. No humans look at it except through logs.

## Answers

- **Problem:** webhooks get lost when an internal consumer is down; nobody can replay them.
- **Users:** two internal services (consumers); the platform team (3 engineers) operating it.
- **Today's alternative:** each consumer receives webhooks directly; missed ones are lost.
- **Core flows:**
  1. Receive a webhook, verify its signature, store it — acceptance: an unsigned or wrongly signed request is rejected with 401 and nothing is stored.
  2. Deliver each stored webhook to every consumer with retries and backoff — acceptance: a consumer down for 10 minutes still receives it once back.
  3. Replay a webhook by id — acceptance: an operator call re-delivers it.
- **First release:** flows 1 and 2. Replay waits.
- **Riskiest assumptions:** consumers are idempotent on webhook id.
- **Non-goals:** no UI, no transformation of payloads, no third-party consumers, not multi-tenant.
- **Success:** zero lost webhooks over a month; p99 receive under 200ms.
- **Surfaces:** HTTP API only. No UI at all.
- **Constraints:** team is fluent in Go; deploy on our existing Kubernetes; Postgres is available managed; must ship in 6 weeks.
- **Scale:** ~20 webhooks/s steady, peaks of 500/s during GitHub incidents.
- **Concurrency shape:** request/response in, fan-out to two consumers.
- **Data:** relational is fine; payloads up to 1 MB.
- **Size:** tool.

## Approvals

Approve every phase.
