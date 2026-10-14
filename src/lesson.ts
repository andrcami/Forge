import matter from 'gray-matter'

export type LessonStatus = 'observed' | 'confirmed' | 'retired'
export type LessonScope = 'project' | 'portable'

export interface Evidence {
  project: string
  ref: string
  date: string
}

export interface Lesson {
  id: string
  scope: LessonScope
  status: LessonStatus
  tags: string[]
  evidence: Evidence[]
  retired_reason: string | null
  body: string
}

export class LessonValidationError extends Error {}

const STATUSES: LessonStatus[] = ['observed', 'confirmed', 'retired']
const SCOPES: LessonScope[] = ['project', 'portable']
const TAG_NAMESPACES = ['stack', 'skill', 'domain', 'platform', 'provider', 'arch']
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseLesson(raw: string): Lesson {
  const { data, content } = matter(raw)
  // Convert any Date objects back to ISO date strings in evidence
  const normalized = { ...data }
  if (Array.isArray(normalized.evidence)) {
    normalized.evidence = normalized.evidence.map((e: any) => ({
      ...e,
      date: typeof e.date === 'string' ? e.date : (e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date)
    }))
  }
  return validateLesson({ ...normalized, body: content.trim() })
}

export function serializeLesson(l: Lesson): string {
  const { body, ...front } = l
  return matter.stringify(body + '\n', front)
}

export function validateLesson(input: unknown): Lesson {
  const l = input as Partial<Lesson>
  const fail = (m: string): never => { throw new LessonValidationError(m) }

  if (typeof l.id !== 'string' || !KEBAB.test(l.id)) fail(`id must be kebab-case: ${String(l.id)}`)
  if (!SCOPES.includes(l.scope as LessonScope)) fail(`scope must be one of ${SCOPES.join(' | ')}`)
  if (!STATUSES.includes(l.status as LessonStatus)) fail(`status must be one of ${STATUSES.join(' | ')}`)
  if (!Array.isArray(l.tags) || l.tags.length === 0) fail('tags must be a non-empty array')

  for (const t of l.tags as string[]) {
    const ns = t.split(':')[0]
    if (!TAG_NAMESPACES.includes(ns)) {
      fail(`tag "${t}" is outside the known namespaces: ${TAG_NAMESPACES.join(', ')}`)
    }
  }

  if (!Array.isArray(l.evidence)) fail('evidence must be an array')
  for (const e of l.evidence as Evidence[]) {
    if (!e.project || !e.ref) fail('each evidence entry needs project and ref')
    if (!ISO_DATE.test(e.date)) fail(`evidence date must be YYYY-MM-DD: ${e.date}`)
  }

  if (l.status === 'retired' && !l.retired_reason) {
    fail('a retired lesson must carry retired_reason')
  }
  if (typeof l.body !== 'string' || l.body.trim() === '') fail('body must be non-empty')

  return {
    id: l.id as string,
    scope: l.scope as LessonScope,
    status: l.status as LessonStatus,
    tags: l.tags as string[],
    evidence: l.evidence as Evidence[],
    retired_reason: l.retired_reason ?? null,
    body: (l.body as string).trim(),
  }
}
