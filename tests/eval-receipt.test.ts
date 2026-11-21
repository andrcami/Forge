import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check, digest, record, RECEIPT } from '../evals/src/receipt.js'

let root: string
const put = async (rel: string, body: string) => {
  await mkdir(dirname(join(root, rel)), { recursive: true })
  await writeFile(join(root, rel), body)
}
const meta = { claude: '2.1.300', model: null }
const pass = (n: string) => ({ [n]: { passed: true, ranAt: '2026-11-20T10:00:00Z' } })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-receipt-'))
  await put('skills/scope/SKILL.md', 'scope\n')
  await put('references/templates/scope.md', '# Scope\n')
  await put('evals/projects/a/expect.json', '{}')
  await put('evals/projects/b/expect.json', '{}')
  await put('src/cli.ts', 'code')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('digest', () => {
  it('changes with an instruction or a sample, not with code outside them or line endings', async () => {
    const d = await digest(root)
    await put('src/cli.ts', 'other code')
    await put('README.md', 'docs')
    await put('evals/projects/a/.cache/x', 'cache')
    expect(await digest(root)).toBe(d)
    await put('skills/scope/SKILL.md', 'scope\r\n')
    expect(await digest(root)).toBe(d)
    await put('skills/scope/SKILL.md', 'scope, edited\n')
    expect(await digest(root)).not.toBe(d)
  })
})

describe('receipt', () => {
  it('is missing until the evals run, then passes once every sample passed against these files', async () => {
    expect((await check(root)).join()).toMatch(/receipt.json is missing/)
    await record(root, pass('a'), meta)
    expect(await check(root)).toEqual(['b: not run against these files'])
    await record(root, pass('b'), meta) // a second batch adds to the first
    expect(await check(root)).toEqual([])
  })

  it('fails a failed sample, and a change to the instructions after the run', async () => {
    await record(root, { ...pass('a'), b: { passed: false, ranAt: 'x' } }, meta)
    expect(await check(root)).toEqual(['b: failed'])
    await record(root, pass('b'), meta)
    await put('skills/scope/SKILL.md', 'scope, edited after the run\n')
    expect((await check(root)).join()).toMatch(/is for other files/)
  })

  it('drops results recorded against other files or another model', async () => {
    await record(root, pass('a'), meta)
    await put('skills/scope/SKILL.md', 'changed\n')
    const r = await record(root, pass('b'), meta)
    expect(Object.keys(r.samples)).toEqual(['b'])
    const m = await record(root, pass('a'), { ...meta, model: 'other-model' })
    expect(Object.keys(m.samples)).toEqual(['a'])
  })

  it('flags a result for a sample that no longer exists', async () => {
    await record(root, { ...pass('a'), ...pass('b'), ...pass('gone') }, meta)
    expect(await check(root)).toEqual(['gone: no such sample (remove it from the receipt by running the evals again)'])
    expect(JSON.parse(await readFile(join(root, RECEIPT), 'utf8')).claude).toBe('2.1.300')
  })
})
