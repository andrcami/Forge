---
id: hmac-over-received-bytes
scope: portable
status: observed
tags:
  - 'stack:any'
  - 'skill:backend'
  - 'domain:webhooks'
evidence:
  - project: billing-gateway
    ref: 'PR #41'
    date: '2026-09-12'
retired_reason: null
---
Compute a webhook's HMAC over the payload bytes exactly as they arrived, before any JSON decode. A decoded and re-encoded body has different bytes, so every signature check fails.

Evidence: billing-gateway parsed the payload into a struct and signed the re-marshalled JSON. Every delivery from the provider was rejected as forged.
