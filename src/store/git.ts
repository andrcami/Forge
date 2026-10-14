import { join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { LocalStore } from './local.js'
import type { LessonStore } from './types.js'
import type { Lesson } from '../lesson.js'

/**
 * Wraps LocalStore with git sync: pull before a read so the library is current,
 * commit and push after a write so other machines see it. Push failures are
 * surfaced, never swallowed — a silently unpushed lesson is a lesson lost.
 */
export class GitStore implements LessonStore {
  private readonly git: SimpleGit
  private readonly local: LocalStore

  constructor(
    private readonly repoDir: string,
    private readonly subdir: string,
    private readonly remote?: string,
  ) {
    this.git = simpleGit(repoDir)
    this.local = new LocalStore(join(repoDir, subdir))
  }

  private async pull(): Promise<void> {
    if (!this.remote) return
    try {
      await this.git.pull()
    } catch (e) {
      if (await this.recoverBrokenCheckout()) return
      throw new Error(
        `could not pull the lesson library — resolve this before writing, or the ` +
        `next push will conflict: ${(e as Error).message}`,
      )
    }
  }

  /**
   * A fresh clone can land with no commits and no branch tracking a remote
   * ref — e.g. the bare remote's HEAD symref points at a branch (named per
   * whichever machine's init.defaultBranch initialized it) that was never
   * pushed, so the clone's checkout fails silently and `git pull` has no
   * upstream to resolve. If exactly one remote branch exists, that's
   * unambiguous: fetch and check it out rather than erroring on a state
   * every other GitStore operation would also hit.
   */
  private async recoverBrokenCheckout(): Promise<boolean> {
    try {
      await this.git.fetch('origin')
      const branches = await this.git.branch(['-r'])
      const remoteBranches = branches.all.filter(b => b !== 'origin/HEAD')
      if (remoteBranches.length !== 1) return false
      const name = remoteBranches[0].replace(/^origin\//, '')
      await this.git.checkout(['-B', name, '--track', `origin/${name}`])
      return true
    } catch {
      return false
    }
  }

  /**
   * Stages and commits ONLY the lesson subdirectory. Staging the whole worktree
   * (`add '.'`) sweeps in whatever else happens to be lying in the clone — a
   * scratch script at the repo root was committed into a lesson commit exactly
   * this way. The commit is likewise pathspec-scoped, so anything a human had
   * already staged in this repo is left alone rather than shipped under a
   * `lessons:` message.
   */
  private async commit(message: string): Promise<void> {
    await this.git.add(this.subdir)
    const status = await this.git.status()
    const staged = status.staged.filter(p => p.startsWith(`${this.subdir}/`))
    if (staged.length === 0) return
    await this.git.commit(message, [this.subdir])
    if (this.remote) await this.push()
  }

  /**
   * A bare `git push` relies on push.default and a local branch name that
   * matches its upstream — neither holds when the clone's default branch
   * (e.g. "master", per the user's init.defaultBranch) differs from the
   * remote's branch (e.g. "main"), which git then refuses as ambiguous.
   * Pushing HEAD to the tracked upstream's branch name sidesteps that.
   */
  private async push(): Promise<void> {
    try {
      const upstream = await this.git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
      const branch = upstream.trim().split('/').slice(1).join('/')
      await this.git.push('origin', `HEAD:refs/heads/${branch}`)
    } catch {
      await this.git.push()
    }
  }

  async list(tags?: string[]): Promise<Lesson[]> {
    await this.pull()
    return this.local.list(tags)
  }

  async read(id: string): Promise<Lesson | null> {
    await this.pull()
    return this.local.read(id)
  }

  async write(lesson: Lesson): Promise<void> {
    await this.pull()
    await this.local.write(lesson)
    const stored = await this.local.read(lesson.id)
    await this.commit(`lessons: ${stored?.status === 'confirmed' ? 'confirm' : 'add'} ${lesson.id}`)
  }

  async retire(id: string, reason: string): Promise<void> {
    await this.pull()
    await this.local.retire(id, reason)
    await this.commit(`lessons: retire ${id}\n\n${reason}`)
  }
}
