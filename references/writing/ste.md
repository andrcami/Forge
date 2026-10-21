# Writing lessons — Simplified Technical English

Lessons are read cold, months later, by another session or another person.
Write them in the rules of ASD-STE100 (Simplified Technical English): text
that has only one possible reading.

This applies to everything a harvest writes or proposes: library lessons,
`## Lessons` lines in skills, and the candidate list shown for approval. It does
not apply to chat. Chat can be as terse as the user likes (caveman mode, for
example). A fragment that is clear in conversation is ambiguous in a file.

STE's approved dictionary is not used. Technical names (`SQLITE_BUSY`,
`http.Client`, `deliveries.attempt`) are allowed as they are.

## The rules

**1. Short sentences.** A rule (a procedural sentence) has 20 words or fewer.
Evidence and explanation (descriptive sentences) have 25 or fewer. Split a
longer sentence.

**2. Active voice.** Name who does what.

> ✗ The signature is verified after the body is parsed.
> ✓ The handler verifies the signature before it parses the body.

**3. One word, one meaning.** Use one term for one thing, and the same term every
time. Prefer the short, common word.

> ✗ Utilize a timeout… set the deadline… the limit expires…
> ✓ Use a timeout… set the timeout… the timeout expires…

**4. Rules start with a command verb.** The first sentence of a lesson is the
rule. It starts with the base form of a verb: *Set*, *Verify*, *Use*, *Do not*.

> ✗ It's important that SQLite connections have a busy timeout.
> ✓ Set a busy timeout on every SQLite connection.

**5. No noun clusters.** Three nouns in a row at most. Break a longer cluster up
with *of*, *for*, or a verb.

> ✗ the delivery worker retry backoff configuration value
> ✓ the value that sets the backoff between delivery retries

Also: one instruction per sentence, and keep articles (*a*, *an*, *the*).

## Shape of a lesson

```markdown
Verify a webhook signature over the raw request body, before you parse it.
Do not verify over re-encoded JSON.

Evidence: the handler verified over `json.Marshal` of the parsed payload.
Re-encoding changes key order and whitespace. About 3% of valid webhooks
failed verification.
```

1. The rule: one or two command sentences.
2. A blank line, then the evidence: what happened, in short active sentences.

A `## Lessons` line in a skill is the rule sentence plus a one-clause source:
`- Start attempt numbers at 1: the column default is 1 (PR #12).`

## Check before you write

- Does the first sentence start with a verb?
- Is each sentence 20 words or fewer (25 for evidence)?
- Is there a passive verb you can make active?
- Is each thing called by one name throughout?

Run `forge lessons check <file>` before you propose a library lesson. It warns
when the first sentence is too long or does not start with a verb. Fix the text
before the write: writing the same lesson again does not replace its text.
`forge lessons write` prints the same warnings, but does not block on them.
