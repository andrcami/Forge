---
name: backend
description: Standards for relay's HTTP handlers and delivery workers. Use when changing internal/receive or internal/deliver.
---

# Backend

- Handlers read the body once and keep the raw bytes.

## Lessons

- Return 202 as soon as a webhook is stored; deliver it from the queue (PR #3).
