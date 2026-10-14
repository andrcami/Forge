import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { main, filterLessons } from '../src/cli.js'
import { serializeLesson, type Lesson } from '../src/lesson.js'

let root: string, home: string, out: string[], err: string[]

const io = () => ({ home, cwd: root, out: (s: string) => out.push(s), err: (s: string) => err.push(s) })
const run = (...argv: string[]) => main(argv, io())

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'cli-lesson', scope: 'portable', status: 'observed',
    tags: ['stack:go', 'skill:database'],
    evidence: [{ project: 'alpha', ref: 'PR #1', date: '2026-10-01' }],
    retired_reason: null, body: 'Always do the thing.', ...over,
  }
}

async function config(store: object) {
  await mkdir(join(home, '.claude', 'forge'), { recursive: true })
  await writeFile(join(home, '.claude', 'forge', 'config.json'), JSON.stringify({ store }))
}

async function lessonFile(name: string, l: Lesson) {
  await writeFile(join(root, name), serializeLesson(l))
  return name
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-cli-'))
  home = join(root, 'home')
  out = []; err = []
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('filterLessons', () => {
  const ls = [
    lesson({ id: 'a', tags: ['stack:go', 'skill:database'] }),
    lesson({ id: 'b', tags: ['arch:queues', 'skill:backend'], status: 'confirmed' }),
    lesson({ id: 'c', tags: ['platform:windows', 'skill:gitflow'], status: 'retired', retired_reason: 'r' }),
  ]
  const ids = (x: Lesson[]) => x.map(l => l.id)

  it('requires every --tag and one --any-tag, with prefix wildcards', () => {
    expect(ids(filterLessons(ls, [], ['stack:*', 'arch:*'], []))).toEqual(['a', 'b'])
    expect(ids(filterLessons(ls, ['skill:*', 'stack:go'], [], []))).toEqual(['a'])
    expect(ids(filterLessons(ls, ['skill:backend'], ['stack:*'], []))).toEqual([])
  })

  it('filters by status', () => {
    expect(ids(filterLessons(ls, [], [], ['confirmed', 'observed']))).toEqual(['a', 'b'])
  })
})

describe('forge lessons — local backend', () => {
  beforeEach(async () => { await config({ backend: 'local', path: join(root, 'lib') }) })

  it('adds a lesson, then promotes it on a second sighting', async () => {
    expect(await run('lessons', 'write', await lessonFile('one.md', lesson()))).toBe(0)
    expect(out.pop()).toBe('added cli-lesson as observed')

    const second = lesson({ evidence: [{ project: 'beta', ref: 'PR #9', date: '2026-10-10' }] })
    expect(await run('lessons', 'write', await lessonFile('two.md', second))).toBe(0)
    expect(out.pop()).toBe('promoted cli-lesson: observed → confirmed')

    expect(await run('lessons', 'read', 'cli-lesson', '--json')).toBe(0)
    const stored = JSON.parse(out.pop()!)
    expect(stored.status).toBe('confirmed')
    expect(stored.evidence).toHaveLength(2)
  })

  it('refuses a project-scoped lesson and reports why', async () => {
    expect(await run('lessons', 'write', await lessonFile('p.md', lesson({ scope: 'project' })))).toBe(1)
    expect(err.pop()).toMatch(/refusing to store a project-scoped lesson/)
  })

  it('refuses an invalid lesson file before touching the library', async () => {
    await writeFile(join(root, 'bad.md'), '---\nid: Not Kebab\n---\nbody\n')
    expect(await run('lessons', 'write', 'bad.md')).toBe(1)
    expect(err.pop()).toMatch(/kebab-case/)
  })

  it('retires with a reason, and lists retired last', async () => {
    await run('lessons', 'write', await lessonFile('one.md', lesson()))
    await run('lessons', 'write', await lessonFile('z.md', lesson({ id: 'a-confirmed', status: 'confirmed' })))
    expect(await run('lessons', 'retire', 'cli-lesson', '--reason', 'did not hold on Postgres 17')).toBe(0)
    out = []
    expect(await run('lessons', 'list')).toBe(0)
    const listing = out.join('\n')
    expect(listing.indexOf('a-confirmed')).toBeLessThan(listing.indexOf('cli-lesson'))
    expect(listing).toMatch(/retired: did not hold on Postgres 17/)
  })

  it('reports a missing lesson and usage errors with distinct exit codes', async () => {
    expect(await run('lessons', 'read', 'nope')).toBe(1)
    expect(await run('lessons', 'retire', 'x')).toBe(2)
    expect(await run('nonsense')).toBe(2)
    expect(err.at(-1)).toMatch(/usage:/)
  })
})

describe('forge lessons — git backend', () => {
  let remote: string, clone: string

  beforeEach(async () => {
    remote = join(root, 'remote.git')
    clone = join(root, 'clone')
    await simpleGit().init(['--bare', remote])
    await simpleGit().clone(remote, clone)
    const g = simpleGit(clone)
    await g.addConfig('user.email', 't@t')
    await g.addConfig('user.name', 't')
    await g.commit('init', [], { '--allow-empty': null })
    await g.push('origin', 'HEAD:refs/heads/main')
    await g.raw(['branch', '--set-upstream-to=origin/main'])
    await config({ backend: 'git', path: clone, remote, subdir: 'lessons' })
  })

  it('commits only the lesson and pushes it', async () => {
    await writeFile(join(clone, 'stray.txt'), 'not a lesson')
    expect(await run('lessons', 'write', await lessonFile('one.md', lesson()))).toBe(0)
    expect(out.pop()).toBe('added cli-lesson as observed — committed and pushed')

    const log = await simpleGit(remote).raw(['log', '--name-only', '--format=%s', 'main', '-1'])
    expect(log).toContain('lessons: add cli-lesson')
    expect(log).toContain('lessons/cli-lesson.md')
    expect(log).not.toContain('stray.txt')
  })

  it('store info reports the resolved layout and a mismatched origin', async () => {
    await config({ backend: 'git', path: clone, remote: 'git@github.com:someone/else.git', subdir: 'lessons' })
    expect(await run('store', 'info', '--json')).toBe(0)
    const info = JSON.parse(out.pop()!)
    expect(info.lessonsDir).toBe(join(clone, 'lessons'))
    expect(info.problems.join()).toMatch(/origin is .*remote\.git, but the config names git@github\.com:someone\/else\.git/)
  })
})

describe('bin/forge', () => {
  it('exists and runs the CLI', async () => {
    const script = await readFile(join(__dirname, '..', 'bin', 'forge'), 'utf8')
    expect(script).toMatch(/src\/cli\.ts/)
  })
})

describe('skills route lesson I/O through the CLI', () => {
  const skill = (n: string) => readFile(join(__dirname, '..', 'skills', n, 'SKILL.md'), 'utf8')

  it('store, harvest, and lessons name the CLI commands they need', async () => {
    expect(await skill('store')).toMatch(/bin\/forge/)
    expect(await skill('store')).toMatch(/Never edit lesson\s+files or run git/)
    expect(await skill('harvest')).toMatch(/forge lessons write/)
    expect(await skill('lessons')).toMatch(/forge lessons write/)
    expect(await skill('lessons')).toMatch(/forge lessons retire/)
  })

  it('every phase that loads lessons says how', async () => {
    for (const n of ['architect', 'design', 'build']) expect(await skill(n), n).toMatch(/forge lessons list/)
  })
})
