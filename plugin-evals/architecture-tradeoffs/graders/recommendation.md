---
type: llm
---

PASS if the response leads with one clear recommendation and justifies it from the stated facts: the team's fluency in Go, the single existing VM with no managed services, and that losing a webhook is the worst outcome (so it says how webhooks are kept durable until they are delivered).
FAIL if it ends without a recommendation, recommends something that needs a managed cloud service, or does not address how webhooks survive a crash before delivery.
