import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseLesson, serializeLesson, validateLesson, type Lesson } from '../lesson.js'
import type { LessonStore } from './types.js'

export class LocalStore implements LessonStore {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return join(this.dir, `${id}.md`)
  }

  async list(tags?: string[]): Promise<Lesson[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
    const lessons: Lesson[] = []
    for (const n of names.filter(n => n.endsWith('.md'))) {
      lessons.push(parseLesson(await readFile(join(this.dir, n), 'utf8')))
    }
    if (!tags?.length) return lessons
    return lessons.filter(l => tags.every(t => l.tags.includes(t)))
  }

  async read(id: string): Promise<Lesson | null> {
    try {
      return parseLesson(await readFile(this.file(id), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  async write(lesson: Lesson): Promise<void> {
    const valid = validateLesson(lesson)
    if (valid.scope !== 'portable') {
      throw new Error(
        `refusing to store a ${valid.scope}-scoped lesson: the library holds portable lessons only`,
      )
    }
    const merged = await this.merge(valid)
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(merged.id), serializeLesson(merged), 'utf8')
  }

  async retire(id: string, reason: string): Promise<void> {
    const existing = await this.read(id)
    if (!existing) throw new Error(`lesson not found: ${id}`)
    const retired = validateLesson({ ...existing, status: 'retired', retired_reason: reason })
    await writeFile(this.file(id), serializeLesson(retired), 'utf8')
  }

  /**
   * A second independent sighting promotes observed to confirmed and appends
   * its evidence — the lifecycle in the spec. A retired lesson stays retired;
   * re-adding one is a deliberate act, not a side effect of a harvest.
   */
  private async merge(incoming: Lesson): Promise<Lesson> {
    const existing = await this.read(incoming.id)
    if (!existing) return incoming
    if (existing.status === 'retired') return existing

    const known = new Set(existing.evidence.map(e => `${e.project}|${e.ref}`))
    const added = incoming.evidence.filter(e => !known.has(`${e.project}|${e.ref}`))
    if (added.length === 0) return existing

    return validateLesson({
      ...existing,
      status: 'confirmed',
      evidence: [...existing.evidence, ...added],
    })
  }
}
