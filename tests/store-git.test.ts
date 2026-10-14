import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { GitStore } from '../src/store/git.js'
import { createStore } from '../src/store/index.js'
import type { Lesson } from '../src/lesson.js'

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'git-lesson',
    scope: 'portable',
    status: 'observed',
    tags: ['stack:any', 'skill:gitflow'],
    evidence: [{ project: 'example-project', ref: 'PR #2', date: '2026-08-31' }],
    retired_reason: null,
    body: 'A lesson stored in git.',
    ...over,
  }
}

let root: string, remoteDir: string, workDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-git-'))
  remoteDir = join(root, 'remote.git')
  workDir = join(root, 'work')

  await simpleGit().init(['--bare', remoteDir])
  const g = simpleGit()
  await g.clone(remoteDir, workDir)
  const w = simpleGit(workDir)
  await w.addConfig('user.email', 'test@test')
  await w.addConfig('user.name', 'test')
  await w.commit('init', [], { '--allow-empty': null })
  await w.push('origin', 'HEAD:refs/heads/main')
  await w.raw(['branch', '--set-upstream-to=origin/main'])
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('GitStore', () => {
  it('commits only the lesson subdir, leaving unrelated worktree files alone', async () => {
    const store = new GitStore(workDir, 'lessons')
    await writeFile(join(workDir, 'scratch.ts'), 'console.log("temp")', 'utf8')

    await store.write(lesson())

    const files = (await simpleGit(workDir).raw(['show', '--name-only', '--format=', 'HEAD']))
      .split('\n').map(s => s.trim()).filter(Boolean)
    expect(files).toEqual(['lessons/git-lesson.md'])
    expect(files).not.toContain('scratch.ts')

    // still untracked afterwards — the store neither committed nor staged it
    expect((await simpleGit(workDir).status()).not_added).toContain('scratch.ts')
  })

  it('does not commit changes a human had already staged elsewhere in the repo', async () => {
    const store = new GitStore(workDir, 'lessons')
    await writeFile(join(workDir, 'README.md'), '# unrelated work in progress', 'utf8')
    await simpleGit(workDir).add('README.md')

    await store.write(lesson())

    const files = (await simpleGit(workDir).raw(['show', '--name-only', '--format=', 'HEAD']))
      .split('\n').map(s => s.trim()).filter(Boolean)
    expect(files).toEqual(['lessons/git-lesson.md'])
    expect((await simpleGit(workDir).status()).staged).toContain('README.md')
  })

  it('commits a written lesson with the lessons: prefix', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson())

    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/^lessons:/)
    expect(await store.read('git-lesson')).toEqual(lesson())
  })

  it('pushes to the remote so another clone sees the lesson', async () => {
    const a = new GitStore(workDir, 'lessons', remoteDir)
    await a.write(lesson())

    const otherDir = join(root, 'other')
    await simpleGit().clone(remoteDir, otherDir)
    const b = new GitStore(otherDir, 'lessons', remoteDir)

    expect((await b.read('git-lesson'))?.id).toBe('git-lesson')
  })

  it('retire commits with a message naming the reason', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson())
    await store.retire('git-lesson', 'no longer true after the v2 rewrite')

    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/retire/)
    expect((await store.read('git-lesson'))?.status).toBe('retired')
  })

  it('list delegates tag filtering to the local backend', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson({ id: 'a', tags: ['skill:backend'] }))
    await store.write(lesson({ id: 'b', tags: ['skill:database'] }))
    expect((await store.list(['skill:database'])).map(l => l.id)).toEqual(['b'])
  })

  it('surfaces a push failure rather than swallowing it', async () => {
    // A pre-receive hook on the bare remote rejects every push while leaving
    // fetch/pull untouched, so `write()`'s pull step still succeeds and the
    // rejection can only come from the push step — proving this specific
    // failure surfaces, not just "some error somewhere" (e.g. a missing
    // remote, which would fail pull first and prove nothing about push).
    await writeFile(
      join(remoteDir, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "push rejected for test" >&2\nexit 1\n',
    )
    await chmod(join(remoteDir, 'hooks', 'pre-receive'), 0o755)

    const store = new GitStore(workDir, 'lessons', remoteDir)
    await expect(store.write(lesson())).rejects.toThrow()
  })
})

describe('createStore', () => {
  it('builds a local backend from config', async () => {
    const store = createStore({ backend: 'local', path: join(root, 'plain') })
    await store.write(lesson())
    expect((await store.read('git-lesson'))?.id).toBe('git-lesson')
  })

  it('builds a git backend from config', async () => {
    const store = createStore({ backend: 'git', path: workDir, subdir: 'lessons' })
    await store.write(lesson())
    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/^lessons:/)
  })
})
