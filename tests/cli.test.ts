import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
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

  it('--stack keeps that stack, stack:any, and lessons with no stack tag', () => {
    const mixed = [...ls,
      lesson({ id: 'd', tags: ['stack:python', 'skill:database'] }),
      lesson({ id: 'e', tags: ['stack:any', 'skill:database'] })]
    expect(ids(filterLessons(mixed, ['skill:database'], [], [], ['python']))).toEqual(['d', 'e'])
    expect(ids(filterLessons(mixed, ['skill:database'], [], [], ['stack:go']))).toEqual(['a', 'e'])
    expect(ids(filterLessons(mixed, [], [], [], ['rust']))).toEqual(['b', 'c', 'e'])
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

  it('check lints a lesson without writing it, and needs no library', async () => {
    const wordy = lesson({ body: 'It is important that every outbound HTTP client has a timeout, because a hung consumer otherwise blocks a worker for hours.' })
    expect(await run('lessons', 'check', await lessonFile('w.md', wordy))).toBe(0)
    expect(out.pop()).toBe('cli-lesson: valid, 2 style warning(s)')
    expect(err.join('\n')).toMatch(/style: the rule \(first sentence\) has 21 words/)
    expect(err.join('\n')).toMatch(/style: the rule should start with a command verb/)
    expect(await run('lessons', 'list')).toBe(0)
    expect(out.pop() ?? '').not.toMatch(/cli-lesson/)

    err = []
    expect(await run('lessons', 'check', await lessonFile('ok.md', lesson({ body: 'Set a timeout on every outbound HTTP client.' })))).toBe(0)
    expect(out.pop()).toBe('cli-lesson: valid')
    expect(err).toEqual([])
  })

  it('write prints style warnings but still writes', async () => {
    expect(await run('lessons', 'write', await lessonFile('w.md', lesson({ body: 'The client needs a timeout.' })))).toBe(0)
    expect(err.join()).toMatch(/style: the rule should start with a command verb/)
    expect(out.pop()).toBe('added cli-lesson as observed')
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

describe('forge lessons — retrieval and merging', () => {
  beforeEach(async () => {
    await config({ backend: 'local', path: join(root, 'lib') })
    for (const l of [
      lesson({ id: 'http-client-timeout', tags: ['stack:any', 'skill:backend', 'domain:http'],
        body: 'Set a timeout on every outbound HTTP client. A client with no timeout blocks a worker for hours.' }),
      lesson({ id: 'outbound-request-timeouts', tags: ['stack:go', 'skill:backend'],
        evidence: [{ project: 'beta', ref: 'PR #3', date: '2026-09-01' }],
        body: 'Give each outbound HTTP request a timeout. Without a timeout, a hung upstream blocks the worker forever.' }),
      lesson({ id: 'sqlite-busy-timeout', tags: ['stack:sqlite', 'skill:database'],
        body: 'Set a busy timeout on every SQLite connection. Without one, a second writer fails at once.' }),
    ]) await run('lessons', 'write', await lessonFile(`${l.id}.md`, l))
    out = []; err = []
  })

  it('search ranks by the words a lesson holds, and honours --stack', async () => {
    expect(await run('lessons', 'search', 'outbound', 'http', 'timeout')).toBe(0)
    const text = out.pop()!
    expect(text.indexOf('http-client-timeout')).toBeLessThan(text.indexOf('sqlite-busy-timeout'))
    expect(await run('lessons', 'search', 'timeout', '--stack', 'python', '--json')).toBe(0)
    expect(JSON.parse(out.pop()!).map((l: Lesson) => l.id)).toEqual(['http-client-timeout'])
    expect(await run('lessons', 'search')).toBe(2)
  })

  it('tags counts each tag and flags near-duplicates', async () => {
    await run('lessons', 'write', await lessonFile('t.md', lesson({ id: 'typo', tags: ['stack:golang', 'skill:backends'] })))
    out = []
    expect(await run('lessons', 'tags')).toBe(0)
    expect(out[0]).toMatch(/^\s+2  skill:backend$/m)
    expect(out.slice(1)).toEqual([
      'similar tags: skill:backend and skill:backends — use one',
      'similar tags: stack:go and stack:golang — use one',
    ])
  })

  it('retag renames a tag everywhere, and validates the new one', async () => {
    expect(await run('lessons', 'retag', 'skill:backend', 'skill:server')).toBe(0)
    expect(out.pop()).toBe('retagged 2 lesson(s): http-client-timeout, outbound-request-timeouts')
    expect(await run('lessons', 'list', '--tag', 'skill:backend')).toBe(0)
    expect(out.pop()).toBe('no matching lessons')
    expect(await run('lessons', 'retag', 'skill:server', 'bogus:x')).toBe(1)
    expect(err.pop()).toMatch(/outside the known namespaces/)
    expect(await run('lessons', 'retag', 'skill:nothing', 'skill:x')).toBe(0)
    expect(out.pop()).toBe('no lesson carries skill:nothing')
  })

  it('similar pairs the two wordings of one rule and nothing else', async () => {
    expect(await run('lessons', 'similar', '--json')).toBe(0)
    expect(JSON.parse(out.pop()!).map((p: { a: string; b: string }) => [p.a, p.b])).toEqual([
      ['http-client-timeout', 'outbound-request-timeouts'],
    ])
    expect(await run('lessons', 'similar', '--min', '2')).toBe(2)
  })

  it('merge folds the duplicate in, and its old id still resolves', async () => {
    const merged = lesson({ id: 'http-client-timeout', tags: ['stack:any', 'skill:backend', 'domain:http'], evidence: [],
      body: 'Set a timeout on every outbound HTTP request. A request with no timeout blocks a worker when the peer hangs.' })
    expect(await run('lessons', 'merge', await lessonFile('m.md', merged), '--from', 'outbound-request-timeouts')).toBe(0)
    expect(out.pop()).toBe('dropped tags: stack:go')
    expect(out.pop()).toBe('merged into http-client-timeout (confirmed, 2 evidence), folding in outbound-request-timeouts')

    expect(await run('lessons', 'read', 'outbound-request-timeouts', '--json')).toBe(0)
    const l = JSON.parse(out.pop()!)
    expect(l.id).toBe('http-client-timeout')
    expect(l.tags).toEqual(['stack:any', 'skill:backend', 'domain:http'])
    expect(l.aliases).toEqual(['outbound-request-timeouts'])

    const again = lesson({ id: 'outbound-request-timeouts', evidence: [{ project: 'gamma', ref: 'PR #8', date: '2026-10-20' }] })
    expect(await run('lessons', 'write', await lessonFile('again.md', again))).toBe(0)
    expect(out.pop()).toBe('updated http-client-timeout (confirmed, 3 evidence) (outbound-request-timeouts was merged into it)')
    expect(await run('lessons', 'merge', 'm.md')).toBe(2)
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

  it('writes all of a large --json output to a pipe before it exits', async () => {
    const lib = join(root, 'big')
    await mkdir(lib, { recursive: true })
    for (let i = 0; i < 300; i++) {
      await writeFile(join(lib, `l-${i}.md`), serializeLesson(lesson({ id: `l-${i}`, body: `Do thing ${i}. ${'x'.repeat(200)}` })))
    }
    await config({ backend: 'local', path: lib })
    const stdout = await new Promise<string>((res, rej) =>
      execFile(join(__dirname, '..', 'bin', 'forge'), ['lessons', 'list', '--json'],
        { env: { ...process.env, HOME: home }, maxBuffer: 1 << 24 }, (e, o) => e ? rej(e) : res(o)))
    expect(stdout.length).toBeGreaterThan(65536)
    expect(JSON.parse(stdout)).toHaveLength(300)
  }, 30000)
})

describe('skills route lesson I/O through the CLI', () => {
  const skill = (n: string) => readFile(join(__dirname, '..', 'skills', n, 'SKILL.md'), 'utf8')

  it('store, harvest, and lessons name the CLI commands they need', async () => {
    expect(await skill('store')).toMatch(/bin\/forge/)
    expect(await skill('store')).toMatch(/Never edit lesson\s+files or run git/)
    expect(await skill('harvest')).toMatch(/forge lessons write/)
    expect(await skill('lessons')).toMatch(/forge lessons write/)
    expect(await skill('lessons')).toMatch(/forge lessons retire/)
    expect(await skill('lessons')).toMatch(/forge lessons similar/)
    expect(await skill('lessons')).toMatch(/forge lessons merge/)
    expect(await skill('harvest')).toMatch(/forge lessons search/)
    expect(await skill('harvest')).toMatch(/forge lessons tags/)
  })

  it('build loads lessons for the chosen stack only', async () => {
    expect(await skill('build')).toMatch(/forge lessons list --tag skill:<concern> --stack/)
  })

  it('every phase that loads lessons says how', async () => {
    for (const n of ['architect', 'design', 'build']) expect(await skill(n), n).toMatch(/forge lessons list/)
  })
})
