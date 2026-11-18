/**
 * Plain-text similarity for lessons: no index, no model, no network. The
 * library is small (hundreds of files at most) and every caller is a person or
 * a skill that reviews the result, so a transparent word-overlap score is
 * enough — and its mistakes are easy to see.
 */
import type { Lesson } from './lesson.js'

const STOPWORDS = new Set(`
a about after all also an and any are as at be because been before being but by can could
do does doing done each else every for from had has have how if in into is it its it's just
may might more most must no not of on once only or other otherwise our out over same should
so some such than that the their them then there these they this those through to too under
until up us use used uses using very was we were what when where which while who why will
with without would you your yes always never than evidence`.split(/\s+/).filter(Boolean))

/** Crude stemming: enough that "timeouts", "timeout" and "timed" meet. */
function stem(w: string): string {
  for (const suf of ['ing', 'ies', 'ied', 'es', 'ed', 's']) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) {
      return suf === 'ies' || suf === 'ied' ? w.slice(0, -3) + 'y' : w.slice(0, -suf.length)
    }
  }
  return w
}

export function tokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}_]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue
    out.add(stem(raw))
  }
  return out
}

/** The words a lesson is about: its id, its tag values, and its body. */
export function lessonTokens(l: Lesson): Set<string> {
  const tagWords = l.tags.map(t => t.split(':').slice(1).join(' '))
  return tokens([l.id.replace(/-/g, ' '), ...(l.aliases ?? []).map(a => a.replace(/-/g, ' ')), ...tagWords, l.body].join(' '))
}

/** The first sentence: under Simplified Technical English, the rule. */
export function ruleOf(body: string): string {
  return body.trim().match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? body.trim().split('\n\n')[0]
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * 0..1. Weighted to the rule sentence, since two lessons that state the same
 * rule are duplicates however differently their evidence reads; a shared
 * `skill:` tag nudges the score, a disjoint stack lowers it.
 */
export function similarity(a: Lesson, b: Lesson): number {
  const rule = jaccard(tokens(ruleOf(a.body)), tokens(ruleOf(b.body)))
  const all = jaccard(lessonTokens(a), lessonTokens(b))
  let score = 0.6 * rule + 0.4 * all
  const skills = (l: Lesson) => l.tags.filter(t => t.startsWith('skill:'))
  if (skills(a).some(t => skills(b).includes(t))) score += 0.05
  const stacks = (l: Lesson) => l.tags.filter(t => t.startsWith('stack:') && t !== 'stack:any')
  const sa = stacks(a), sb = stacks(b)
  if (sa.length && sb.length && !sa.some(t => sb.includes(t))) score -= 0.1
  return Math.max(0, Math.min(1, score))
}

export interface SimilarPair { a: Lesson; b: Lesson; score: number }

export function similarPairs(lessons: Lesson[], min: number): SimilarPair[] {
  const pairs: SimilarPair[] = []
  for (let i = 0; i < lessons.length; i++) {
    for (let j = i + 1; j < lessons.length; j++) {
      const score = similarity(lessons[i], lessons[j])
      if (score >= min) pairs.push({ a: lessons[i], b: lessons[j], score })
    }
  }
  return pairs.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id))
}

/** Lessons ranked by how many of the query's words they contain; 0-scored lessons are dropped. */
export function search(lessons: Lesson[], query: string): { lesson: Lesson; score: number }[] {
  const q = tokens(query)
  if (q.size === 0) return []
  return lessons
    .map(lesson => {
      const have = lessonTokens(lesson)
      const rule = tokens(ruleOf(lesson.body))
      let score = 0
      for (const t of q) score += have.has(t) ? (rule.has(t) ? 1.25 : 1) : 0
      return { lesson, score: score / (q.size * 1.25) }
    })
    .filter(r => r.score > 0)
    .sort((x, y) => y.score - x.score || x.lesson.id.localeCompare(y.lesson.id))
}

/** Common spellings of the same tag value; a library should use one. */
const SYNONYMS: string[][] = [
  ['ts', 'typescript'], ['js', 'javascript'], ['node', 'nodejs', 'node-js'], ['pg', 'postgres', 'postgresql'],
  ['k8s', 'kubernetes'], ['py', 'python'], ['golang', 'go'], ['gh', 'github'], ['mac', 'macos', 'osx'],
  ['win', 'windows'], ['react-js', 'reactjs', 'react'], ['next', 'nextjs', 'next-js'], ['tf', 'terraform'],
]

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

/**
 * Pairs of tags that probably name the same thing: one value under two
 * namespaces, or synonyms, plurals and one-letter typos within one namespace.
 * A `skill:` tag is never paired across namespaces, and neither is `any`.
 */
export function nearDuplicateTags(tags: string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const [na, va] = [tags[i].split(':')[0], tags[i].split(':').slice(1).join(':')]
      const [nb, vb] = [tags[j].split(':')[0], tags[j].split(':').slice(1).join(':')]
      if (va === vb) {
        // one value under two namespaces: `stack:docker` and `platform:docker`.
        // `skill:` routes a lesson rather than describing it, so `skill:security`
        // beside `domain:security` is not drift; nor is `any`, which differs per namespace.
        if (na !== nb && va !== 'any' && na !== 'skill' && nb !== 'skill') out.push([tags[i], tags[j]])
        continue
      }
      if (na !== nb) continue
      const syn = SYNONYMS.some(g => g.includes(va) && g.includes(vb))
      const plural = va + 's' === vb || vb + 's' === va
      const typo = Math.min(va.length, vb.length) >= 5 && editDistance(va, vb) <= 1
      if (syn || plural || typo) out.push([tags[i], tags[j]])
    }
  }
  return out
}
