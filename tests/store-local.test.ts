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
})
