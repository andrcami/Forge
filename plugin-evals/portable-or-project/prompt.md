---
name: portable-or-project
description: Sort a branch's findings into library lessons and project lessons
tags: [lessons]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm about to open the PR for a branch in our Go webhook relay, and I use Forge. These are the things the branch taught us. Which belong in my shared lesson library, which stay in this project only, and which aren't worth writing down? Give each one a verdict and a one-line reason.

1. The provider signs the raw request body, so verifying over a re-encoded body rejects every webhook.
2. Our `deliveries.attempt` column counts from 1, not 0.
3. SQLite returns SQLITE_BUSY at once when a second writer arrives, unless the connection sets a busy timeout.
4. I fixed a typo in the README ("recieve").
5. Our design token for the error colour is `--relay-red-600`.
