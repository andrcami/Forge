---
id: verify-webhook-raw-body
scope: portable
status: observed
tags:
  - 'stack:any'
  - 'skill:backend'
  - 'domain:webhooks'
evidence:
  - project: relay
    ref: 'PR #9'
    date: '2026-09-15'
retired_reason: null
---
Verify a webhook signature over the request body as received. A re-encoded body has different bytes, so the check rejects every real delivery.
