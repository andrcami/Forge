---
name: architecture-tradeoffs
description: Compare candidate stacks with real costs and failure modes, then recommend one
tags: [architect]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm using Forge and I'm at the architecture step for a small internal tool. The scope is approved; here are the facts:

- A webhook relay: receive webhooks from 3 providers, verify signatures, store them, deliver to 5 internal services with retries.
- About 2,000 webhooks a day, peaks of 50 a minute. One team of two; both write Go daily, one knows Python.
- Runs on a single VM we already have. No managed cloud services. Losing a webhook is the worst outcome.

Don't write any files. Compare candidate stacks and recommend one.
