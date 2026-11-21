import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPin, collectPins, newestTag, report, type LsRemote } from '../src/pin-check.js'

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), T = 't'.repeat(40)

describe('newestTag', () => {
  it('picks the highest release by number, peeled to its commit', () => {
    const out = [
      `${T}\trefs/tags/v3.10.0`, `${A}\trefs/tags/v3.10.0^{}`,
      `${B}\trefs/tags/v3.9.2`,
      `${C}\trefs/tags/v4.0.0-beta.1`,
      `${C}\trefs/tags/nightly`,
    ].join('\n')
    expect(newestTag(out)).toEqual({ tag: 'v3.10.0', sha: A })
  })

  it('returns null when there is no release tag', () => {
    expect(newestTag(`${A}\trefs/tags/nightly\n`)).toBeNull()
  })
})

describe('checkPin', () => {
  const tags: LsRemote = () => `${T}\trefs/tags/v2.0.0\n${B}\trefs/tags/v2.0.0^{}\n${A}\trefs/tags/v1.0.0\n`
  const head: LsRemote = (_r, _f, p) => (p?.[0] === 'HEAD' ? `${C}\tHEAD\n` : '')

  it('flags a pin behind the newest release', () => {
    const s = checkPin({ pin: { name: 'x', repo: 'o/x', ref: A, track: 'tags' }, samples: ['s'] }, tags)
    expect(s).toMatchObject({ behind: true, latest: B, tag: 'v2.0.0' })
  })

  it('passes a pin on the newest release', () => {
    expect(checkPin({ pin: { name: 'x', repo: 'o/x', ref: B, track: 'tags' }, samples: [] }, tags).behind).toBe(false)
  })

  it('compares with the default branch when the pin does not track tags', () => {
    expect(checkPin({ pin: { name: 'x', repo: 'o/x', ref: A }, samples: [] }, head)).toMatchObject({ track: 'branch', behind: true, latest: C })
  })

  it('reports an unreadable upstream instead of calling the pin current or behind', () => {
    const s = checkPin({ pin: { name: 'x', repo: 'o/x', ref: A }, samples: [] }, () => { throw new Error('network down') })
    expect(s).toMatchObject({ behind: false, latest: null, error: 'network down' })
    expect(report([s])).toMatch(/unknown/)
  })
})

describe('collectPins', () => {
  it('groups one pin used by several samples', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pin-check-'))
    const pin = { name: 'x', repo: 'o/x', ref: A }
    for (const [name, plugins] of [['one', [pin]], ['two', [pin, { ...pin, name: 'y', repo: 'o/y' }]], ['none', undefined]] as const) {
      await mkdir(join(root, 'evals', 'projects', name), { recursive: true })
      await writeFile(join(root, 'evals', 'projects', name, 'expect.json'), JSON.stringify({ harness: plugins ? { plugins } : undefined }))
    }
    const uses = await collectPins(root)
    expect(uses.map(u => [u.pin.name, u.samples])).toEqual([['x', ['one', 'two']], ['y', ['two']]])
  })
})

describe('report', () => {
  it('explains how to move a pin only when one is behind', () => {
    const base = { name: 'x', repo: 'o/x', track: 'tags' as const, pinned: A, latest: B, tag: 'v2.0.0', samples: ['s'] }
    expect(report([{ ...base, behind: true }])).toMatch(/To move a pin/)
    expect(report([{ ...base, latest: A, behind: false }])).not.toMatch(/To move a pin/)
  })
})
