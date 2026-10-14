import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, DEFAULT_CONFIG, resolveConfig, PROJECT_FILE } from '../src/config.js'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'forge-home-')) })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('loadConfig', () => {
  it('returns the local-backend default when no config file exists', async () => {
    expect(await loadConfig(home)).toEqual({
      store: { backend: 'local', path: join(home, '.claude', 'forge', 'lessons') },
    })
  })

  it('reads a git-backend config from ~/.claude/forge/config.json', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'git', path: '~/.claude/forge/lessons',
               remote: 'git@github.com:example/forge-lessons.git', subdir: 'lessons' },
    }))
    const cfg = await loadConfig(home)
    expect(cfg.store.backend).toBe('git')
    expect(cfg.store.subdir).toBe('lessons')
  })

  it('expands a leading ~ in the store path', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'local', path: '~/lessons-here' },
    }))
    const cfg = await loadConfig(home)
    expect(cfg.store.path).toBe(join(home, 'lessons-here'))
    expect(cfg.store.path).not.toContain('~')
  })

  it('rejects an unknown backend rather than falling back silently', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'ftp', path: '/tmp/x' },
    }))
    await expect(loadConfig(home)).rejects.toThrow(/backend/)
  })
})

describe('resolveConfig — per-project override', () => {
  const machine = async (store: object) => {
    await mkdir(join(home, '.claude', 'forge'), { recursive: true })
    await writeFile(join(home, '.claude', 'forge', 'config.json'), JSON.stringify({ store }))
  }

  it('uses a .forge.json in a parent of cwd over the machine config', async () => {
    await machine({ backend: 'local', path: '/personal' })
    const project = join(home, 'work', 'clinic')
    await mkdir(join(project, 'src', 'deep'), { recursive: true })
    await writeFile(join(project, PROJECT_FILE), JSON.stringify({
      store: { backend: 'git', path: '~/dev/9h-lessons', remote: 'git@github.com:9h/forge-lessons.git', subdir: 'lessons' },
    }))
    const r = await resolveConfig(home, join(project, 'src', 'deep'))
    expect(r.source).toEqual({ kind: 'project', file: join(project, PROJECT_FILE) })
    expect(r.store.path).toBe(join(home, 'dev', '9h-lessons'))
    expect(r.store.remote).toBe('git@github.com:9h/forge-lessons.git')
  })

  it('falls back to the machine config, then the default', async () => {
    const elsewhere = join(home, 'personal-project')
    await mkdir(elsewhere, { recursive: true })
    expect((await resolveConfig(home, elsewhere)).source.kind).toBe('default')
    await machine({ backend: 'local', path: '/personal' })
    const r = await resolveConfig(home, elsewhere)
    expect(r.source.kind).toBe('machine')
    expect(r.store.path).toBe('/personal')
  })

  it('does not look above the home directory', async () => {
    // a .forge.json above home must not capture every project on the machine
    const outer = await mkdtemp(join(tmpdir(), 'forge-outer-'))
    const inner = join(outer, 'home')
    await mkdir(join(inner, 'proj'), { recursive: true })
    await writeFile(join(outer, PROJECT_FILE), JSON.stringify({ store: { backend: 'local', path: '/captured' } }))
    expect((await resolveConfig(inner, join(inner, 'proj'))).source.kind).toBe('default')
    await rm(outer, { recursive: true, force: true })
  })

  it('resolves a relative project path against the project file, and rejects bad files', async () => {
    const project = join(home, 'p')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, PROJECT_FILE), JSON.stringify({ store: { backend: 'local', path: 'lessons-here' } }))
    expect((await resolveConfig(home, project)).store.path).toBe(join(project, 'lessons-here'))
    await writeFile(join(project, PROJECT_FILE), '{ nope')
    await expect(resolveConfig(home, project)).rejects.toThrow(/not valid JSON/)
    await writeFile(join(project, PROJECT_FILE), JSON.stringify({ store: { backend: 'ftp', path: 'x' } }))
    await expect(resolveConfig(home, project)).rejects.toThrow(/backend/)
  })
})
