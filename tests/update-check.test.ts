import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — a plain .mjs hook, no type declarations
import { check, choose, compare, refresh } from '../hooks/update-check.mjs'

const hook = join(__dirname, '..', 'hooks', 'update-check.mjs')
let root: string, home: string, plugin: string
const NOW = Date.parse('2026-10-21T12:00:00Z')

async function installed(version: string) {
  await mkdir(join(plugin, '.claude-plugin'), { recursive: true })
  await writeFile(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'forge', version }))
}
async function cached(latest: string | null, checkedAt = NOW - 1000) {
  await mkdir(join(home, '.claude/forge'), { recursive: true })
  await writeFile(join(home, '.claude/forge/update-check.json'), JSON.stringify({ latest, checkedAt }))
}
async function config(value: object) {
  await mkdir(join(home, '.claude/forge'), { recursive: true })
  await writeFile(join(home, '.claude/forge/config.json'), JSON.stringify(value))
}
const run = (env: Record<string, string> = {}) => check({ home, root: plugin, now: NOW, env })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-update-'))
  home = join(root, 'home'); plugin = join(root, 'plugin')
  await mkdir(home, { recursive: true })
  await installed('0.7.0')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(compare('0.10.0', '0.9.9')).toBe(1)
    expect(compare('0.7.0', '0.7.0')).toBe(0)
    expect(compare('0.6.1', '0.7.0')).toBe(-1)
    expect(compare(null, '0.7.0')).toBe(0)
    expect(compare('main', '0.7.0')).toBe(0)
  })

  it('asks the user to choose once a newer version is cached, without running anything', async () => {
    await cached('0.8.0')
    const { out, refresh: stale, update } = run()
    expect(out).toMatch(/Forge 0\.8\.0 is available; this session runs 0\.7\.0/)
    expect(out).toMatch(/AskUserQuestion/)
    for (const option of ['"Update now"', '"Not now"', '"Skip 0.8.0"', '"Always update"']) expect(out).toContain(option)
    for (const c of ['update', 'skip', 'always']) expect(out).toMatch(new RegExp(`update-check\\.mjs" --choose ${c}`))
    expect(out).toMatch(/Run nothing until they choose/)
    expect(out).toMatch(/\/plugin update forge@forge/) // the manual fallback
    expect(stale).toBe(false)
    expect(update).toBe(false)
  })

  it('is silent when up to date, or when the installed copy is newer', async () => {
    await cached('0.7.0')
    expect(run().out).toBe('')
    await cached('0.6.1')
    expect(run().out).toBe('')
  })

  it('stays silent for a skipped version, and asks again for a newer one', async () => {
    await cached('0.8.0')
    await config({ skipVersion: '0.8.0' })
    expect(run().out).toBe('')
    await cached('0.8.1')
    expect(run().out).toMatch(/Forge 0\.8\.1 is available/)
  })

  it('starts the update itself when autoUpdate is on, and only tells Claude to mention it', async () => {
    await cached('0.8.0')
    await config({ autoUpdate: true })
    const { out, update } = run()
    expect(update).toBe(true)
    expect(out).toMatch(/updating from 0\.7\.0 to 0\.8\.0 in the background/)
    expect(out).toMatch(/Do not run anything for it/)
    expect(out).not.toMatch(/AskUserQuestion/)
  })

  it('asks for a refresh with no cache or a cache older than a day, and stays silent meanwhile', async () => {
    expect(run()).toEqual({ out: '', refresh: true, update: false })
    await cached('0.8.0', NOW - 25 * 60 * 60 * 1000)
    const { out, refresh: stale } = run()
    expect(stale).toBe(true)
    expect(out).toMatch(/0\.8\.0/) // a stale cache still tells what it knows
  })

  it('can be turned off in the config or the environment', async () => {
    await cached('0.8.0')
    const off = { out: '', refresh: false, update: false }
    expect(run({ FORGE_NO_UPDATE_CHECK: '1' })).toEqual(off)
    await config({ store: { backend: 'local', path: '/x' }, updateCheck: false, autoUpdate: true })
    expect(run()).toEqual(off)
  })

  describe('choose', () => {
    const readConfig = async () => JSON.parse(await readFile(join(home, '.claude/forge/config.json'), 'utf8'))
    const store = { backend: 'local', path: '/x' }
    let calls: number
    const update = (code = 0) => () => { calls++; return code }
    beforeEach(async () => { calls = 0; await cached('0.8.0'); await config({ store }) })

    it('update runs the update and clears a skipped version, keeping the rest of the config', async () => {
      await config({ store, skipVersion: '0.7.5' })
      expect(choose('update', { home, update: update() })).toBe(0)
      expect(calls).toBe(1)
      expect(await readConfig()).toEqual({ store })
    })

    it('skip records the cached version and runs nothing', async () => {
      expect(choose('skip', { home, update: update() })).toBe(0)
      expect(calls).toBe(0)
      expect(await readConfig()).toEqual({ store, skipVersion: '0.8.0' })
    })

    it('always turns autoUpdate on and updates now', async () => {
      expect(choose('always', { home, update: update() })).toBe(0)
      expect(calls).toBe(1)
      expect(await readConfig()).toEqual({ store, autoUpdate: true })
    })

    it('passes on a failed update, and refuses an unknown choice', async () => {
      expect(choose('update', { home, update: update(3) })).toBe(3)
      expect(choose('yes', { home, update: update() })).toBe(2)
      expect(calls).toBe(1)
    })
  })

  describe('refresh', () => {
    let server: Server, url: string, body: string, status: number
    beforeEach(async () => {
      body = JSON.stringify({ name: 'forge', version: '0.9.0' }); status = 200
      server = createServer((_q, r) => { r.statusCode = status; r.end(body) })
      await new Promise<void>(res => server.listen(0, '127.0.0.1', res))
      url = `http://127.0.0.1:${(server.address() as { port: number }).port}/plugin.json`
    })
    afterEach(() => new Promise<void>(res => server.close(() => res())))
    const cache = async () => JSON.parse(await readFile(join(home, '.claude/forge/update-check.json'), 'utf8'))

    it('caches the latest version', async () => {
      await refresh({ home, url, now: NOW })
      expect(await cache()).toEqual({ latest: '0.9.0', checkedAt: NOW })
    })

    it('keeps the last known version on a failure, and records the attempt', async () => {
      await cached('0.8.0', 1)
      status = 500
      await refresh({ home, url, now: NOW })
      expect(await cache()).toEqual({ latest: '0.8.0', checkedAt: NOW })
      await refresh({ home, url: 'http://127.0.0.1:1/x', now: NOW + 1 })
      expect(await cache()).toEqual({ latest: '0.8.0', checkedAt: NOW + 1 })
    })
  })

  it('runs as a hook: prints the notice, exits 0, and is registered for new sessions', async () => {
    await cached('99.0.0', Date.now())
    const out = await new Promise<string>((res, rej) =>
      execFile('node', [hook], { env: { ...process.env, HOME: home, FORGE_NO_UPDATE_CHECK: '' } },
        (e, stdout) => e ? rej(e) : res(stdout)))
    expect(out).toMatch(/Forge 99\.0\.0 is available/)
    const { hooks } = JSON.parse(await readFile(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'))
    const entry = hooks.SessionStart.find((h: { matcher?: string }) => h.matcher === 'startup')
    expect(JSON.stringify(entry)).toMatch(/update-check\.mjs/)
  })
})
