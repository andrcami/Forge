import { describe, it, expect } from 'vitest'
import { parseLesson, serializeLesson, validateLesson, LessonValidationError, styleWarnings } from '../src/lesson.js'

const VALID = `---
id: example-provider-auth-check
scope: portable
status: confirmed
tags: [stack:any, skill:backend, domain:webhooks]
evidence:
  - project: example-project
    ref: "PR #12"
    date: 2026-07-20
retired_reason: null
---
Verify a provider's real auth mechanism against its docs before writing the handler.
`

describe('parseLesson', () => {
  it('parses frontmatter and body', () => {
    const l = parseLesson(VALID)
    expect(l.id).toBe('example-provider-auth-check')
    expect(l.scope).toBe('portable')
    expect(l.status).toBe('confirmed')
    expect(l.tags).toEqual(['stack:any', 'skill:backend', 'domain:webhooks'])
    expect(l.evidence).toHaveLength(1)
    expect(l.evidence[0].ref).toBe('PR #12')
    expect(l.retired_reason).toBeNull()
    expect(l.body).toContain('Verify a provider')
  })
})

describe('serializeLesson', () => {
  it('round-trips through parse', () => {
    const l = parseLesson(VALID)
    const again = parseLesson(serializeLesson(l))
    expect(again).toEqual(l)
  })
})

describe('validateLesson', () => {
  it('rejects an unknown status', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), status: 'maybe' }))
      .toThrow(LessonValidationError)
  })

  it('rejects a non-kebab-case id', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), id: 'Provider Auth' }))
      .toThrow(LessonValidationError)
  })

  it('rejects a tag outside the known namespaces', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), tags: ['random:thing'] }))
      .toThrow(LessonValidationError)
  })

  it('requires retired_reason when status is retired', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), status: 'retired', retired_reason: null }))
      .toThrow(LessonValidationError)
  })

  it('accepts a valid lesson unchanged', () => {
    const l = parseLesson(VALID)
    expect(validateLesson(l)).toEqual(l)
  })
})

describe('styleWarnings (Simplified Technical English)', () => {
  it('accepts a short rule that starts with a command verb', () => {
    expect(styleWarnings('Set a busy timeout on every SQLite connection.\n\nEvidence: two writers collided.')).toEqual([])
    expect(styleWarnings('Do not verify over re-encoded JSON.')).toEqual([])
    expect(styleWarnings('Always set `http.Client{Timeout: 10 * time.Second}` on outbound clients.')).toEqual([])
  })

  it('flags a rule that does not start with a command verb', () => {
    for (const body of ['It is important to set a timeout.', 'The handler must verify first.', 'Using a timeout helps.', 'We should set a timeout.']) {
      expect(styleWarnings(body).join(), body).toMatch(/command verb/)
    }
  })

  it('flags a rule over 20 words, counting code as one word', () => {
    const long = 'Set ' + Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ') + '.'
    expect(styleWarnings(long).join()).toMatch(/has 21 words/)
    expect(styleWarnings('Set `a b c d e f g h i j k l m n o p q r s t u v` now.')).toEqual([])
  })

  it('reads the first sentence even across line breaks, and without a full stop', () => {
    expect(styleWarnings('Verify the signature over the raw\nrequest body. Then parse it.')).toEqual([])
    expect(styleWarnings('Verify the signature first\n\nEvidence: it broke.')).toEqual([])
  })
})
