import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const hook = join(__dirname, '..', 'hooks', 'lesson-checkpoint.mjs')
let root: string, home: string

const stop = (input: Record<string, unknown>) => new Promise<string>((res, rej) => {
  const child = execFile('node', [hook], { env: { ...process.env, HOME: home } },
    (e, stdout) => e ? rej(e) : res(stdout))
  child.stdin!.end(JSON.stringify({ session_id: 's1', cwd: root, stop_hook_active: false, ...input }))
})

async function configure(extra: Record<string, unknown> = {}) {
  await mkdir(join(home, '.claude/forge'), { recursive: true })
  await writeFile(join(home, '.claude/forge/config.json'),
    JSON.stringify({ store: { backend: 'local', path: '/x' }, ...extra }))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-checkpoint-'))
  home = join(root, 'home')
  await mkdir(home, { recursive: true })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('lesson checkpoint', () => {
  it('is silent when no library is configured', async () => {
    for (let i = 0; i < 6; i++) expect(await stop({})).toBe('')
  })

  it('asks for lessons every fifth turn by default, and only proposes', async () => {
    await configure()
    for (let i = 0; i < 4; i++) expect(await stop({})).toBe('')
    const said = JSON.parse(await stop({}))
    expect(said.decision).toBe('block')
    expect(said.reason).toMatch(/every 5 turns/)
    expect(said.reason).toMatch(/ask\s+before writing anything/)
    expect(said.reason).toMatch(/If nothing qualifies, stop without mentioning/)
    // the counter starts over
    expect(await stop({})).toBe('')
  })

  it('never blocks a stop it already caused', async () => {
    await configure({ lessonCheckpointEvery: 1 })
    expect(await stop({ stop_hook_active: true })).toBe('')
    expect(await stop({})).toMatch(/"block"/)
  })

  it('counts each session separately', async () => {
    await configure({ lessonCheckpointEvery: 2 })
    expect(await stop({ session_id: 'a' })).toBe('')
    expect(await stop({ session_id: 'b' })).toBe('')
    expect(await stop({ session_id: 'a' })).toMatch(/"block"/)
  })

  it('can be disabled with lessonCheckpointEvery: 0', async () => {
    await configure({ lessonCheckpointEvery: 0 })
    for (let i = 0; i < 6; i++) expect(await stop({})).toBe('')
  })

  it('honours a project .forge.json', async () => {
    const project = join(home, 'clinic')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, '.forge.json'), JSON.stringify({
      store: { backend: 'git', path: '~/work-clone', remote: 'x' }, lessonCheckpointEvery: 1,
    }))
    expect(await stop({ cwd: project })).toMatch(/every turn\)/)
  })

  it('is registered as a Stop hook', async () => {
    const hooks = JSON.parse(await readFile(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'))
    expect(JSON.stringify(hooks.hooks.Stop)).toMatch(/lesson-checkpoint\.mjs/)
  })
})
