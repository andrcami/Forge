import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, chmod, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { main } from '../src/cli.js'
import { ghCommand } from '../src/setup.js'
import { serializeLesson, type Lesson } from '../src/lesson.js'

let root: string, home: string, out: string[], err: string[]
const savedPath = process.env.PATH

const run = (...argv: string[]) =>
  main(argv, { home, cwd: root, out: s => out.push(s), err: s => err.push(s) })

function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id, scope: 'portable', status: 'observed', tags: ['stack:any', 'skill:gitflow'],
    evidence: [{ project: 'p', ref: 'PR #1', date: '2026-10-01' }], retired_reason: null,
    body: `Rule for ${id}.`, ...over,
  }
}

async function bare(name: string): Promise<string> {
  const dir = join(root, 'remotes', `${name}.git`)
  await mkdir(dir, { recursive: true })
  await simpleGit(dir).init(['--bare', '--initial-branch=main'])
  return dir
}

async function remoteFiles(remote: string): Promise<string[]> {
  return (await simpleGit(remote).raw(['ls-tree', '-r', '--name-only', 'main'])).trim().split('\n')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-setup-'))
  home = join(root, 'home')
  out = []; err = []
  await mkdir(home, { recursive: true })
  // commits need an identity; keep the developer's global config out of it
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'test'
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'test@test'
})
afterEach(async () => {
  process.env.PATH = savedPath
  await rm(root, { recursive: true, force: true })
})

describe('forge store init — git URL', () => {
  it('clones an empty repo, seeds it, pushes, writes the config, and the library works', async () => {
    const remote = await bare('lib')
    expect(await run('store', 'init', '--repo', remote, '--path', 'clone'), err.join()).toBe(0)

    expect(await remoteFiles(remote)).toEqual(['README.md', 'lessons/.gitkeep'])
    const config = JSON.parse(await readFile(join(home, '.claude/forge/config.json'), 'utf8'))
    expect(config.store).toEqual({ backend: 'git', path: join(root, 'clone'), remote, subdir: 'lessons' })

    await writeFile(join(root, 'l.md'), serializeLesson(lesson('first-lesson')))
    expect(await run('lessons', 'write', 'l.md'), err.join()).toBe(0)
    expect(await remoteFiles(remote)).toContain('lessons/first-lesson.md')
  })

  it('uses an existing library as it is, without committing anything', async () => {
    const remote = await bare('lib')
    const seed = join(root, 'seed')
    await simpleGit().clone(remote, seed)
    await mkdir(join(seed, 'lessons'))
    await writeFile(join(seed, 'lessons', 'kept.md'), serializeLesson(lesson('kept')))
    const g = simpleGit(seed)
    await g.add('.'); await g.commit('lessons: add kept'); await g.push('origin', 'HEAD:refs/heads/main')
    const before = await simpleGit(remote).raw(['rev-parse', 'main'])

    expect(await run('store', 'init', '--repo', remote, '--path', 'clone'), err.join()).toBe(0)
    expect(await simpleGit(remote).raw(['rev-parse', 'main'])).toBe(before)
    out = []
    await run('lessons', 'list')
    expect(out.join()).toMatch(/kept/)
  })

  it('imports existing lessons in one commit, skipping project-scoped ones', async () => {
    const remote = await bare('lib')
    const from = join(root, 'old')
    await mkdir(from)
    await writeFile(join(from, 'a.md'), serializeLesson(lesson('a-lesson')))
    await writeFile(join(from, 'b.md'), serializeLesson(lesson('b-lesson')))
    await writeFile(join(from, 'p.md'), serializeLesson(lesson('project-only', { scope: 'project' })))

    expect(await run('store', 'init', '--repo', remote, '--path', 'clone', '--import', 'old'), err.join()).toBe(0)
    expect(await remoteFiles(remote)).toEqual(expect.arrayContaining(['lessons/a-lesson.md', 'lessons/b-lesson.md']))
    expect(await remoteFiles(remote)).not.toContain('lessons/project-only.md')
    expect(await simpleGit(remote).raw(['log', '-1', '--format=%s', 'main'])).toMatch(/lessons: import 2 lessons/)
  })

  it('refuses to replace a different config without --force, and keeps a backup with it', async () => {
    const remote = await bare('lib')
    await mkdir(join(home, '.claude/forge'), { recursive: true })
    await writeFile(join(home, '.claude/forge/config.json'), JSON.stringify({ store: { backend: 'local', path: '/x' } }))

    expect(await run('store', 'init', '--repo', remote, '--path', 'clone')).toBe(1)
    expect(err.pop()).toMatch(/already points somewhere else[\s\S]*--force/)

    expect(await run('store', 'init', '--repo', remote, '--path', 'clone', '--force'), err.join()).toBe(0)
    expect(await readFile(join(home, '.claude/forge/config.json.bak'), 'utf8')).toMatch(/"\/x"/)
  })

  it('refuses a non-empty directory that is not a clone', async () => {
    const remote = await bare('lib')
    await mkdir(join(root, 'busy'))
    await writeFile(join(root, 'busy', 'file'), 'x')
    expect(await run('store', 'init', '--repo', remote, '--path', 'busy')).toBe(1)
    expect(err.pop()).toMatch(/not empty/)
  })

  it('needs a repo or --local', async () => {
    expect(await run('store', 'init', '--path', 'x')).toBe(2)
  })
})

describe('forge store init — GitHub slug via gh', () => {
  beforeEach(async () => {
    // A fake gh: repos live under $root/remotes/<owner>/<name>.git
    const bin = join(root, 'bin')
    await mkdir(bin)
    await writeFile(join(bin, 'gh'), `#!/bin/sh
R="${join(root, 'remotes')}"
case "$1 $2" in
  "--version "*) echo "gh fake"; exit 0;;
  "repo view") [ -d "$R/$3.git" ] && echo "$R/$3.git" && exit 0; exit 1;;
  "repo create") case "$*" in *--private*) ;; *) echo "not private" >&2; exit 2;; esac
                 mkdir -p "$R/$3.git" && git init -q --bare --initial-branch=main "$R/$3.git"; echo "$R/$3.git" >> "$R/created"; exit 0;;
esac
exit 1
`)
    await chmod(join(bin, 'gh'), 0o755)
    process.env.PATH = `${bin}:${savedPath}`
  })

  it('says how to create a missing repo when --create is not given', async () => {
    expect(await run('store', 'init', '--repo', 'me/lessons', '--path', 'clone')).toBe(1)
    expect(err.pop()).toMatch(/does not exist.*--create/)
  })

  it('creates a missing repo as private with --create, then seeds and pushes it', async () => {
    expect(await run('store', 'init', '--repo', 'me/lessons', '--path', 'clone', '--create'), err.join()).toBe(0)
    expect(out.join('\n')).toMatch(/created me\/lessons \(private\)/)
    const remote = join(root, 'remotes', 'me', 'lessons.git')
    expect(await remoteFiles(remote)).toEqual(['README.md', 'lessons/.gitkeep'])
    expect(await readdir(join(root, 'remotes'))).toContain('created')
  })
})

describe('forge store init --local', () => {
  it('writes a local config, importing lessons', async () => {
    const from = join(root, 'old')
    await mkdir(from)
    await writeFile(join(from, 'a.md'), serializeLesson(lesson('a-lesson')))
    expect(await run('store', 'init', '--local', '--path', 'lib', '--import', 'old'), err.join()).toBe(0)
    const config = JSON.parse(await readFile(join(home, '.claude/forge/config.json'), 'utf8'))
    expect(config.store).toEqual({ backend: 'local', path: join(root, 'lib') })
    expect(await readdir(join(root, 'lib'))).toEqual(['a-lesson.md'])
  })
})

describe('session-start check', () => {
  const hook = join(__dirname, '..', 'hooks', 'session-start.sh')
  const runHook = async (h: string) => {
    const { execFile } = await import('node:child_process')
    return new Promise<string>((res, rej) =>
      execFile('sh', [hook], { env: { ...process.env, HOME: h } }, (e, stdout) => e ? rej(e) : res(stdout)))
  }

  it('suggests /forge:setup when no library is configured, without acting', async () => {
    const said = await runHook(home)
    expect(said).toMatch(/lesson library is not set up/)
    expect(said).toMatch(/suggest \/forge:setup once/)
    expect(said).toMatch(/Do not run it unprompted/)
  })

  it('is silent once configured', async () => {
    await mkdir(join(home, '.claude/forge'), { recursive: true })
    await writeFile(join(home, '.claude/forge/config.json'), '{"store":{"backend":"local","path":"/x"}}')
    expect(await runHook(home)).toBe('')
  })
})

describe('setup skill guardrails', () => {
  it('creates repos private and only after an explicit yes', async () => {
    const skill = await readFile(join(__dirname, '..', 'skills', 'setup', 'SKILL.md'), 'utf8')
    expect(skill).toMatch(/\*\*private\*\* repository/)
    expect(skill).toMatch(/only after an\s+explicit yes/)
    expect(skill).toMatch(/Never create a public repository/)
    expect(skill).toMatch(/forge store init/)
  })
})

describe('per-project library', () => {
  it('init --project writes a portable .forge.json, and lessons in that project go to its library', async () => {
    const work = await bare('work-lib')
    const personal = await bare('personal-lib')
    expect(await run('store', 'init', '--repo', personal, '--path', join(home, 'personal-clone')), err.join()).toBe(0)

    const project = join(root, 'home', 'work', 'clinic')
    await mkdir(project, { recursive: true })
    const inProject = (...argv: string[]) =>
      main(argv, { home, cwd: project, out: s => out.push(s), err: s => err.push(s) })

    expect(await inProject('store', 'init', '--project', '--repo', work, '--path', join(home, 'work-clone')), err.join()).toBe(0)
    const file = JSON.parse(await readFile(join(project, '.forge.json'), 'utf8'))
    expect(file.store.path).toBe('~/work-clone')
    // the machine config is untouched
    expect(JSON.parse(await readFile(join(home, '.claude/forge/config.json'), 'utf8')).store.remote).toBe(personal)

    await writeFile(join(project, 'l.md'), serializeLesson(lesson('work-only-lesson')))
    expect(await inProject('lessons', 'write', 'l.md'), err.join()).toBe(0)
    expect(await remoteFiles(work)).toContain('lessons/work-only-lesson.md')
    expect(await remoteFiles(personal)).not.toContain('lessons/work-only-lesson.md')

    out = []
    await inProject('store', 'info')
    expect(out.join('\n')).toMatch(/config:\s+project — .*clinic\/\.forge\.json/)
  })

  it('on a new machine, init --project clones what the committed file names', async () => {
    const work = await bare('work-lib')
    const project = join(home, 'clinic')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, '.forge.json'), JSON.stringify({
      store: { backend: 'git', path: '~/work-clone', remote: work, subdir: 'lessons' },
    }))
    const inProject = (...argv: string[]) =>
      main(argv, { home, cwd: project, out: s => out.push(s), err: s => err.push(s) })

    expect(await inProject('lessons', 'list')).toBe(1)
    expect(err.pop()).toMatch(/not cloned at .*work-clone — run \/forge:setup \(or: forge store init --project\)/)

    expect(await inProject('store', 'init', '--project'), err.join()).toBe(0)
    expect(await inProject('lessons', 'list'), err.join()).toBe(0)
  })

  it('the session-start check honours a project file', async () => {
    const { execFile } = await import('node:child_process')
    const hook = join(__dirname, '..', 'hooks', 'session-start.sh')
    const project = join(home, 'clinic')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, '.forge.json'), JSON.stringify({
      store: { backend: 'git', path: '~/work-clone', remote: 'x', subdir: 'lessons' },
    }))
    const say = () => new Promise<string>((res, rej) => execFile('sh', [hook],
      { cwd: project, env: { ...process.env, HOME: home, PWD: project } }, (e, o) => e ? rej(e) : res(o)))
    expect(await say()).toMatch(/lesson library for this project .*not cloned at .*work-clone/)
    await mkdir(join(home, 'work-clone'))
    expect(await say()).toBe('')
  })
})

describe('ghCommand', () => {
  it('names gh.exe on Windows, so a stray extension-less gh on PATH cannot shadow it', () => {
    expect(ghCommand('win32')).toBe('gh.exe')
    expect(ghCommand('linux')).toBe('gh')
    expect(ghCommand('darwin')).toBe('gh')
  })
})
