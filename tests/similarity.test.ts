import { describe, it, expect } from 'vitest'
import { nearDuplicateTags, search, similarity, similarPairs, tokens } from '../src/similarity.js'
import { SIMILAR_MIN } from '../src/cli.js'
import type { Lesson } from '../src/lesson.js'

function lesson(id: string, body: string, tags = ['stack:any', 'skill:backend']): Lesson {
  return {
    id, scope: 'portable', status: 'observed', tags, retired_reason: null, body,
    evidence: [{ project: 'p', ref: 'PR #1', date: '2026-10-01' }],
  }
}

const timeoutA = lesson('http-client-timeout',
  'Set a timeout on every outbound HTTP client. A client with no timeout blocks a worker for hours when the peer hangs.')
const timeoutB = lesson('outbound-request-timeouts',
  'Give each outbound HTTP request a timeout. Without a timeout, a hung upstream blocks the worker forever.')
const busy = lesson('sqlite-busy-timeout',
  'Set a busy timeout on every SQLite connection. Without one, a second writer fails at once with SQLITE_BUSY.',
  ['stack:sqlite', 'skill:database'])
const webhook = lesson('verify-webhook-raw-body',
  'Verify webhook signatures over the raw request body. A re-serialized JSON body changes the bytes, so every signature fails.')
const webhookGo = lesson('go-webhook-raw-bytes',
  'Compute webhook signatures over the raw body bytes, not a re-encoded struct. Re-encoding changes the bytes and every check fails.',
  ['stack:go', 'skill:backend'])

describe('tokens', () => {
  it('drops stopwords and numbers, and stems plurals and tenses', () => {
    expect([...tokens('The timeouts were raised after 30 seconds')]).toEqual(['timeout', 'rais', 'second'])
    expect(tokens('retries').has('retry')).toBe(true)
  })
})

describe('similarity', () => {
  it('scores two wordings of one rule above the default threshold', () => {
    expect(similarity(timeoutA, timeoutB)).toBeGreaterThanOrEqual(SIMILAR_MIN)
    expect(similarity(webhook, webhookGo)).toBeGreaterThanOrEqual(SIMILAR_MIN)
  })

  it('scores lessons that only share a word or two below it', () => {
    expect(similarity(timeoutA, busy)).toBeLessThan(SIMILAR_MIN)
    expect(similarity(timeoutA, webhook)).toBeLessThan(SIMILAR_MIN)
    expect(similarity(busy, webhook)).toBeLessThan(SIMILAR_MIN)
  })

  it('lowers the score for lessons tied to different stacks', () => {
    const asPython = { ...webhook, tags: ['stack:python', 'skill:backend'] }
    const asGo = { ...webhook, tags: ['stack:go', 'skill:backend'] }
    expect(similarity(webhookGo, asPython)).toBeLessThan(similarity(webhookGo, asGo))
  })
})

describe('similarPairs', () => {
  it('finds exactly the duplicates in a mixed library, best first', () => {
    const pairs = similarPairs([timeoutA, busy, webhook, timeoutB, webhookGo], SIMILAR_MIN)
    expect(pairs.map(p => [p.a.id, p.b.id].sort().join(' ~ ')).sort()).toEqual([
      'go-webhook-raw-bytes ~ verify-webhook-raw-body',
      'http-client-timeout ~ outbound-request-timeouts',
    ])
    expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[1].score)
  })
})

describe('search', () => {
  it('ranks lessons by the query words they contain, and drops those with none', () => {
    const hits = search([timeoutA, busy, webhook], 'http timeout')
    expect(hits.map(h => h.lesson.id)).toEqual(['http-client-timeout', 'sqlite-busy-timeout'])
    expect(search([timeoutA], 'kubernetes')).toEqual([])
  })

  it('matches tag values and ids, not only the body', () => {
    expect(search([timeoutA, busy], 'sqlite').map(h => h.lesson.id)).toEqual(['sqlite-busy-timeout'])
  })
})

describe('nearDuplicateTags', () => {
  it('flags synonyms, plurals and one-letter typos inside a namespace', () => {
    expect(nearDuplicateTags(['stack:ts', 'stack:typescript', 'skill:database', 'skill:databases',
      'domain:webhook', 'domain:webhok'])).toEqual([
      ['stack:ts', 'stack:typescript'], ['skill:database', 'skill:databases'], ['domain:webhook', 'domain:webhok'],
    ])
  })

  it('flags one value under two namespaces, except any and skill:', () => {
    expect(nearDuplicateTags(['stack:docker', 'platform:docker', 'provider:docker', 'stack:any', 'platform:any',
      'skill:security', 'domain:security'])).toEqual([
      ['stack:docker', 'platform:docker'], ['stack:docker', 'provider:docker'], ['platform:docker', 'provider:docker'],
    ])
  })

  it('leaves distinct short values alone', () => {
    expect(nearDuplicateTags(['stack:go', 'stack:js', 'skill:qa', 'skill:ui'])).toEqual([])
  })
})
