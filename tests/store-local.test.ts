import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalStore } from '../src/store/local.js'
import type { Lesson } from '../src/lesson.js'

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'test-lesson',
    scope: 'portable',
    status: 'observed',
    tags: ['stack:any', 'skill:backend'],
    evidence: [{ project: 'example-project', ref: 'PR #1', date: '2026-08-31' }],
    retired_reason: null,
    body: 'A durable lesson.',
    ...over,
  }
}

let dir: string
let store: LocalStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  store = new LocalStore(dir)
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('LocalStore', () => {
  it('round-trips a written lesson', async () => {
    await store.write(lesson())
    expect(await store.read('test-lesson')).toEqual(lesson())
  })

  it('returns null for an unknown id', async () => {
    expect(await store.read('nope')).toBeNull()
  })

  it('lists all lessons when no tags are given', async () => {
    await store.write(lesson({ id: 'one' }))
    await store.write(lesson({ id: 'two' }))
    expect((await store.list()).map(l => l.id).sort()).toEqual(['one', 'two'])
  })

  it('filters by tag, matching lessons carrying every requested tag', async () => {
    await store.write(lesson({ id: 'be', tags: ['stack:any', 'skill:backend'] }))
    await store.write(lesson({ id: 'db', tags: ['stack:any', 'skill:database'] }))
    const hits = await store.list(['skill:backend'])
    expect(hits.map(l => l.id)).toEqual(['be'])
  })

  it('rejects a project-scoped lesson — the library holds portable only', async () => {
    await expect(store.write(lesson({ scope: 'project' }))).rejects.toThrow(/portable/)
  })

  it('rejects an invalid lesson at write time', async () => {
    await expect(store.write(lesson({ status: 'maybe' as never }))).rejects.toThrow()
  })

  it('retire sets status and reason, preserving the entry', async () => {
    await store.write(lesson())
    await store.retire('test-lesson', 'superseded by the adapter rule')
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('retired')
    expect(l?.retired_reason).toBe('superseded by the adapter rule')
    expect(l?.body).toBe('A durable lesson.')
  })

  it('retire throws for an unknown id', async () => {
    await expect(store.retire('nope', 'reason')).rejects.toThrow(/not found/)
  })

  it('write on an existing id promotes observed to confirmed and appends evidence', async () => {
    await store.write(lesson())
    await store.write(lesson({
      evidence: [{ project: 'other', ref: 'PR #9', date: '2026-09-01' }],
    }))
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('confirmed')
    expect(l?.evidence).toHaveLength(2)
  })

  it('write against a retired lesson does not resurrect it', async () => {
    await store.write(lesson())
    await store.retire('test-lesson', 'superseded')
    await store.write(lesson({
      evidence: [{ project: 'other', ref: 'PR #9', date: '2026-09-01' }],
    }))
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('retired')
    expect(l?.retired_reason).toBe('superseded')
    expect(l?.evidence).toHaveLength(1)
  })

  it('write carrying only known evidence leaves lesson unchanged', async () => {
    await store.write(lesson())
    await store.write(lesson())
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('observed')
    expect(l?.evidence).toHaveLength(1)
  })

  it('write with one duplicate and one new evidence entry results in exactly 2 entries', async () => {
    await store.write(lesson())
    await store.write(lesson({
      evidence: [
        { project: 'example-project', ref: 'PR #1', date: '2026-08-31' },
        { project: 'other', ref: 'PR #9', date: '2026-09-01' },
      ],
    }))
    const l = await store.read('test-lesson')
    expect(l?.evidence).toHaveLength(2)
    expect(l?.status).toBe('confirmed')
  })

  it('does not promote on a second sighting from the same project', async () => {
    await store.write(lesson())
    await store.write(lesson({ evidence: [{ project: 'example-project', ref: 'PR #7', date: '2026-09-02' }] }))
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('observed')
    expect(l?.evidence).toHaveLength(2)
  })

  it('counts differently written names of one project as one project', async () => {
    await store.write(lesson({ evidence: [{ project: 'Paths EMR', ref: 'PR #1', date: '2026-09-01' }] }))
    await store.write(lesson({ evidence: [{ project: 'paths-emr', ref: 'PR #2', date: '2026-09-02' }] }))
    await store.write(lesson({ evidence: [{ project: 'paths_emr (staging)', ref: 'PR #3', date: '2026-09-03' }] }))
    expect((await store.read('test-lesson'))?.status).toBe('observed')
    await store.write(lesson({ evidence: [{ project: 'Eventfull', ref: 'PR #4', date: '2026-09-04' }] }))
    expect((await store.read('test-lesson'))?.status).toBe('confirmed')
  })

  it('adds the tags a second sighting brings', async () => {
    await store.write(lesson())
    await store.write(lesson({
      tags: ['stack:any', 'skill:backend', 'domain:webhooks'],
      evidence: [{ project: 'other', ref: 'PR #9', date: '2026-09-01' }],
    }))
    expect((await store.read('test-lesson'))?.tags).toEqual(['stack:any', 'skill:backend', 'domain:webhooks'])
  })
})

describe('LocalStore.merge', () => {
  const a = () => lesson({ id: 'http-timeout', tags: ['stack:any', 'skill:backend'], body: 'Set a timeout on every HTTP client.' })
  const b = () => lesson({
    id: 'request-timeouts', tags: ['stack:go', 'skill:backend'], body: 'Give each request a timeout.',
    evidence: [{ project: 'other', ref: 'PR #4', date: '2026-07-01' }],
  })

  it('folds the sources into one lesson: evidence and old ids as aliases, with the given tags', async () => {
    await store.write(a())
    await store.write(b())
    const { lesson: merged, removed, droppedTags } = await store.merge(
      lesson({ id: 'http-timeout', body: 'Set a timeout on every outbound HTTP request.', evidence: [],
        tags: ['stack:any', 'skill:backend', 'domain:http'] }),
      ['http-timeout', 'request-timeouts'])

    expect(removed).toEqual(['request-timeouts'])
    expect(merged.body).toBe('Set a timeout on every outbound HTTP request.')
    expect(merged.status).toBe('confirmed') // evidence now spans two projects
    expect(merged.evidence.map(e => e.ref)).toEqual(['PR #4', 'PR #1'])
    expect(merged.tags).toEqual(['stack:any', 'skill:backend', 'domain:http'])
    expect(droppedTags).toEqual(['stack:go'])
    expect(merged.aliases).toEqual(['request-timeouts'])
    expect((await store.list()).map(l => l.id)).toEqual(['http-timeout'])
  })

  it('edits one lesson\'s tags when it is merged into itself', async () => {
    await store.write(lesson({ id: 'tool', tags: ['stack:any', 'skill:store', 'platform:any'] }))
    const { removed, droppedTags } = await store.merge(lesson({ id: 'tool', tags: ['stack:any', 'skill:devops'] }), ['tool'])
    expect(removed).toEqual([])
    expect(droppedTags).toEqual(['skill:store', 'platform:any'])
    const l = await store.read('tool')
    expect(l?.tags).toEqual(['stack:any', 'skill:devops'])
    expect(l?.aliases).toBeUndefined()
    expect(l?.evidence).toHaveLength(1)
  })

  it('resolves an old id afterwards: read finds it, and a write under it lands on the merged lesson', async () => {
    await store.write(a())
    await store.write(b())
    await store.merge(lesson({ id: 'outbound-timeouts', evidence: [] }), ['http-timeout', 'request-timeouts'])

    expect((await store.read('request-timeouts'))?.id).toBe('outbound-timeouts')
    await store.write(lesson({ id: 'http-timeout', evidence: [{ project: 'third', ref: 'PR #2', date: '2026-10-01' }] }))
    expect((await store.list()).map(l => l.id)).toEqual(['outbound-timeouts'])
    expect((await store.read('outbound-timeouts'))?.evidence).toHaveLength(3)
    expect((await store.read('outbound-timeouts'))?.aliases).toEqual(['http-timeout', 'request-timeouts'])
  })

  it('keeps observed when every sighting is from one project', async () => {
    await store.write(a())
    await store.write(lesson({ id: 'b-same', evidence: [{ project: 'example-project', ref: 'PR #3', date: '2026-09-03' }] }))
    const { lesson: merged } = await store.merge(a(), ['b-same'])
    expect(merged.status).toBe('observed')
  })

  it('refuses to merge a retired lesson with an active one', async () => {
    await store.write(a())
    await store.write(b())
    await store.retire('request-timeouts', 'did not hold')
    await expect(store.merge(a(), ['http-timeout', 'request-timeouts'])).rejects.toThrow(/retired/)
    expect((await store.list())).toHaveLength(2)
  })

  it('folds the sources into an existing lesson named as the target', async () => {
    await store.write(a())
    await store.write(b())
    const { removed } = await store.merge(a(), ['request-timeouts'])
    expect(removed).toEqual(['request-timeouts'])
    expect((await store.read('http-timeout'))?.evidence).toHaveLength(2)
  })

  it('refuses a target id that is an alias of a lesson outside the merge', async () => {
    await store.write(a())
    await store.write(b())
    await store.merge(lesson({ id: 'http-timeout', evidence: [] }), ['request-timeouts'])
    await store.write(lesson({ id: 'bystander' }))
    await expect(store.merge(lesson({ id: 'request-timeouts' }), ['bystander'])).rejects.toThrow(/was merged into http-timeout/)
  })

  it('throws for an unknown source', async () => {
    await expect(store.merge(a(), ['nope'])).rejects.toThrow(/not found/)
  })
})
