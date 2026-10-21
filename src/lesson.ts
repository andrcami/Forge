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

/** Words that cannot open a command sentence. */
const NOT_A_COMMAND = new Set([
  'a', 'an', 'the', 'it', "it's", 'its', 'this', 'that', 'these', 'those', 'there', 'here',
  'when', 'if', 'in', 'on', 'for', 'with', 'by', 'to', 'as', 'at', 'after', 'before', 'because',
  'we', 'our', 'you', 'your', 'i', 'my', 'they', 'some', 'many', 'most', 'each', 'every', 'all',
  'is', 'are', 'was', 'were', 'be', 'should', 'must', 'can', 'may', 'might', 'would', 'could',
])
/** Words that may come before the verb: "Always set…", "Do not…". */
const LEADING = new Set(['always', 'never', 'only', 'do', 'not', "don't"])

export const RULE_MAX_WORDS = 20

/**
 * Style warnings for a lesson body, from Simplified Technical English
 * (references/writing/ste.md): the first sentence is the rule, so it must start
 * with a command verb and have at most 20 words. Advisory only; never blocks a write.
 */
export function styleWarnings(body: string): string[] {
  const text = body.trim().replace(/`[^`]*`/g, 'CODE')
  const first = (text.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? text.split('\n\n')[0]).replace(/\s+/g, ' ').trim()
  const words = first.split(' ').filter(w => /[\p{L}\p{N}]/u.test(w))
  const warnings: string[] = []
  if (words.length > RULE_MAX_WORDS) {
    warnings.push(`the rule (first sentence) has ${words.length} words; keep it to ${RULE_MAX_WORDS} or fewer`)
  }
  const opener = words.map(w => w.toLowerCase().replace(/[^\p{L}']/gu, '')).find(w => !LEADING.has(w)) ?? ''
  if (opener && (NOT_A_COMMAND.has(opener) || /(ing|ed)$/.test(opener) && opener.length > 4)) {
    warnings.push(`the rule should start with a command verb ("Set…", "Verify…", "Do not…"), not "${words[0]}"`)
  }
  return warnings
}
