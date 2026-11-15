import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { parseLesson, serializeLesson, validateLesson, type Evidence, type Lesson, type LessonStatus } from '../lesson.js'
import type { LessonStore, MergeResult } from './types.js'

const evidenceKey = (e: Evidence) => `${e.project}|${e.ref}`

/** How many different projects a lesson has been seen in. */
export function projectCount(evidence: Evidence[]): number {
  return new Set(evidence.map(e => e.project)).size
}

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
    for (const n of names.filter(n => n.endsWith('.md')).sort()) {
      lessons.push(parseLesson(await readFile(join(this.dir, n), 'utf8')))
    }
    if (!tags?.length) return lessons
    return lessons.filter(l => tags.every(t => l.tags.includes(t)))
  }

  private async readFile(id: string): Promise<Lesson | null> {
    try {
      return parseLesson(await readFile(this.file(id), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  /** By id, or by an id that was merged into another lesson. */
  async read(id: string): Promise<Lesson | null> {
    return (await this.readFile(id)) ?? (await this.list()).find(l => l.aliases?.includes(id)) ?? null
  }

  async write(lesson: Lesson): Promise<void> {
    const valid = validateLesson(lesson)
    if (valid.scope !== 'portable') {
      throw new Error(
        `refusing to store a ${valid.scope}-scoped lesson: the library holds portable lessons only`,
      )
    }
    const merged = await this.mergeSighting(valid)
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(merged.id), serializeLesson(merged), 'utf8')
  }

  async retire(id: string, reason: string): Promise<void> {
    const existing = await this.read(id)
    if (!existing) throw new Error(`lesson not found: ${id}`)
    const retired = validateLesson({ ...existing, status: 'retired', retired_reason: reason })
    await writeFile(this.file(existing.id), serializeLesson(retired), 'utf8')
  }

  /**
   * Folds lessons that say the same thing into one. `into` carries the merged
   * text and the merged tags — a person chose them with every source in view,
   * so a wrong tag on a source can be left behind; the tags left out are
   * returned so the caller can report them. The sources' evidence and ids join
   * it, and their files go. The old ids become aliases, so a later sighting
   * under one still lands here.
   */
  async merge(into: Lesson, from: string[]): Promise<MergeResult> {
    const target = validateLesson(into)
    if (target.scope !== 'portable') throw new Error('the library holds portable lessons only')
    const sources: Lesson[] = []
    for (const id of new Set(from)) {
      const s = await this.read(id)
      if (!s) throw new Error(`lesson not found: ${id}`)
      if (!sources.some(x => x.id === s.id)) sources.push(s)
    }
    if (sources.length === 0) throw new Error('merge needs at least one --from lesson')
    // merging into an existing id folds the sources into that lesson;
    // an id that is another lesson's alias would hide that lesson, so refuse it
    const occupant = await this.read(target.id)
    if (occupant && !sources.some(s => s.id === occupant.id)) {
      if (occupant.id !== target.id) {
        throw new Error(`${target.id} was merged into ${occupant.id}; merge into ${occupant.id}, or add it with --from`)
      }
      sources.push(occupant)
    }
    const retired = sources.filter(s => s.status === 'retired')
    if (retired.length && retired.length !== sources.length) {
      throw new Error(`cannot merge retired (${retired.map(s => s.id).join(', ')}) with active lessons: ` +
        'a retired lesson records what did not hold — retire the others, or keep them apart')
    }

    const evidence: Evidence[] = []
    for (const e of [...target.evidence, ...sources.flatMap(s => s.evidence)]) {
      if (!evidence.some(x => evidenceKey(x) === evidenceKey(e))) evidence.push(e)
    }
    evidence.sort((a, b) => a.date.localeCompare(b.date) || evidenceKey(a).localeCompare(evidenceKey(b)))

    let status: LessonStatus = target.status
    if (retired.length) status = 'retired'
    else if (status !== 'retired' && (sources.some(s => s.status === 'confirmed') || projectCount(evidence) >= 2)) status = 'confirmed'

    const aliases = new Set([...(target.aliases ?? []), ...sources.flatMap(s => [s.id, ...(s.aliases ?? [])])])
    aliases.delete(target.id)

    const lesson = validateLesson({
      ...target,
      status,
      tags: target.tags,
      evidence,
      retired_reason: status === 'retired'
        ? target.retired_reason ?? [...new Set(retired.map(s => s.retired_reason))].join(' ')
        : null,
      aliases: [...aliases],
    })

    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(lesson.id), serializeLesson(lesson), 'utf8')
    const removed = sources.map(s => s.id).filter(id => id !== lesson.id)
    for (const id of removed) await unlink(this.file(id))
    const droppedTags = [...new Set(sources.flatMap(s => s.tags))].filter(t => !lesson.tags.includes(t))
    return { lesson, removed, droppedTags }
  }

  async retag(from: string, to: string): Promise<string[]> {
    const changed: string[] = []
    for (const l of await this.list()) {
      if (!l.tags.includes(from)) continue
      const tags = [...new Set(l.tags.map(t => (t === from ? to : t)))]
      await writeFile(this.file(l.id), serializeLesson(validateLesson({ ...l, tags })), 'utf8')
      changed.push(l.id)
    }
    return changed
  }

  /**
   * A second sighting appends its evidence and adds any new tags, so the lesson
   * is found under every context it has bitten in. It is promoted from observed
   * to confirmed only when the evidence spans two projects: two PRs in one repo
   * are one context, not an independent confirmation. A retired lesson stays
   * retired; re-adding one is a deliberate act, not a side effect of a harvest.
   */
  private async mergeSighting(incoming: Lesson): Promise<Lesson> {
    const existing = await this.read(incoming.id)
    if (!existing) return incoming
    if (existing.status === 'retired') return existing

    const known = new Set(existing.evidence.map(evidenceKey))
    const added = incoming.evidence.filter(e => !known.has(evidenceKey(e)))
    if (added.length === 0) return existing

    const evidence = [...existing.evidence, ...added]
    return validateLesson({
      ...existing,
      status: existing.status === 'confirmed' || projectCount(evidence) >= 2 ? 'confirmed' : 'observed',
      tags: [...new Set([...existing.tags, ...incoming.tags])],
      evidence,
    })
  }
}
