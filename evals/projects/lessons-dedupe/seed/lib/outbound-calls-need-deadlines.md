---
id: outbound-calls-need-deadlines
scope: portable
status: observed
tags:
  - 'stack:go'
  - 'skill:backend'
evidence:
  - project: relay
    ref: 'PR #12'
    date: '2026-10-03'
retired_reason: null
---
Give every outbound HTTP request a deadline. A request to a hung upstream otherwise blocks its worker forever.

Evidence: in relay, one consumer stopped responding mid-request, and the delivery worker that called it never returned.
