---
id: store-raw-payload
scope: portable
status: confirmed
tags:
  - 'stack:any'
  - 'skill:database'
evidence:
  - project: relay
    ref: 'PR #4'
    date: '2026-08-01'
  - project: billing-gateway
    ref: 'PR #41'
    date: '2026-09-12'
retired_reason: null
aliases:
  - keep-payload-bytes
---
Store each received payload as its raw bytes, never decoded and re-encoded. A re-encoded copy no longer matches its signature.
