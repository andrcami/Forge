---
id: http-client-timeout
scope: portable
status: observed
tags:
  - 'stack:any'
  - 'skill:backend'
evidence:
  - project: ledger
    ref: 'PR #7'
    date: '2026-08-20'
retired_reason: null
---
Set a connect timeout and a read timeout on every outbound HTTP client. A client without them waits forever when the peer stops answering.

Evidence: in ledger, a payment-status poller hung on one slow upstream call, and its worker stopped processing for six hours.
