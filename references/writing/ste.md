# Writing lessons — Simplified Technical English

Lessons are read cold, months later, by another session or another person.
Write them in the rules of ASD-STE100 (Simplified Technical English): text
that has only one possible reading.

This applies to everything a harvest writes or proposes: library lessons,
`## Lessons` lines in skills, and the candidate list shown for approval. It does
not apply to chat. Chat can be as terse as the user likes (caveman mode, for
example). A fragment that is clear in conversation is ambiguous in a file.

STE's approved dictionary is not used. Technical names (`ENOSPC`,
`Cache-Control`, `orders.total_cents`) are allowed as they are.

## The rules

**1. Short sentences.** A rule (a procedural sentence) has 20 words or fewer.
Evidence and explanation (descriptive sentences) have 25 or fewer. Split a
longer sentence.

**2. Active voice.** Name who does what.

> ✗ The upload is rejected after the file is scanned.
> ✓ The server scans the file, then rejects the upload.

**3. One word, one meaning.** Use one term for one thing, and the same term every
time. Prefer the short, common word.

> ✗ Utilize a timeout… set the deadline… the limit expires…
> ✓ Use a timeout… set the timeout… the timeout expires…

**4. Rules start with a command verb.** The first sentence of a lesson is the
rule. It starts with the base form of a verb: *Set*, *Verify*, *Use*, *Do not*.

> ✗ It's important that cached pages have a short lifetime.
> ✓ Set `max-age` to 60 seconds or less on cached pages.

**5. No noun clusters.** Three nouns in a row at most. Break a longer cluster up
with *of*, *for*, or a verb.

> ✗ the image upload size limit error message
> ✓ the error message for an image that is too large

Also: one instruction per sentence, and keep articles (*a*, *an*, *the*).

## Shape of a lesson

```markdown
Store money as integer cents. Do not store it as a float.

Evidence: the checkout added `0.1 + 0.2` and charged 0.30000000000000004.
The payment provider rejected the amount. About 1 in 500 orders failed.
```

1. The rule: one or two command sentences.
2. A blank line, then the evidence: what happened, in short active sentences.

A `## Lessons` line in a skill is the rule sentence plus a one-clause source:
`- Read `orders.total_cents` as cents, not dollars (PR #7).`

## Check before you write

- Does the first sentence start with a verb?
- Is each sentence 20 words or fewer (25 for evidence)?
- Is there a passive verb you can make active?
- Is each thing called by one name throughout?

Run `forge lessons check <file>` before you propose a library lesson. It warns
when the first sentence is too long or does not start with a verb. Fix the text
before the write: writing the same lesson again does not replace its text.
`forge lessons write` prints the same warnings, but does not block on them.
