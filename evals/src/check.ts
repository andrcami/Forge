import { readFile, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import matter from 'gray-matter'
import { parseLesson, type Lesson } from '../../src/lesson.js'

/** An external plugin a sample runs with, pinned so a run is reproducible. */
export interface PluginPin {
  name: string
  /** owner/repo on GitHub */
  repo: string
  /** a full commit SHA */
  ref: string
}

/** One command the runner executed in the generated project. */
export interface VerifyStep {
  command: string
  code: number
  tail: string
}

/** Checks any sample can make on the files it leaves behind. */
interface ContentExpect {
  skills?: { present?: string[]; absent?: string[] }
  files?: { present?: string[]; absent?: string[] }
  /** `file` may hold `*` in a path segment: contains needs one match, notContains forbids every match. */
  contains?: Array<{ file: string; pattern: string; why: string }>
  notContains?: Array<{ file: string; pattern: string; why: string }>
}

/** What a sample project should look like after the phases it lists have run. */
export interface PhaseExpectation {
  description: string
  /** Phases the runner invokes, in order. A phase that should refuse is still listed. */
  phases: Array<'scope' | 'architect' | 'design' | 'build'>
  /** How the runner sets the sample up. Never shown to the phases. */
  harness?: {
    /** External plugins installed alongside Forge. */
    plugins?: PluginPin[]
    /** Also run the generated e2e command (needs a browser). Install and test always run. */
    e2e?: boolean
  }
  expect: ContentExpect & {
    sizeClass: 'throwaway' | 'tool' | 'product'
    hasUI: boolean
    /** Approvals that must be stamped. Any approval not listed must be absent. */
    approvals: Array<'scope' | 'architecture' | 'design'>
    /** null: no escalation may be open. An object: one must be, owned by this phase. */
    escalation: null | { owner: 'scope' | 'architecture' | 'design' }
  }
}

/** A lesson the library must hold after a harvest. */
export interface LibraryLesson {
  /** regex the lesson body must match (case-insensitive) */
  match: string
  why: string
  id?: string
  status?: 'observed' | 'confirmed' | 'retired'
  /** tags it must carry; a trailing `*` matches a namespace, e.g. `skill:*` */
  tags?: string[]
  /** how many evidence entries it must have */
  evidence?: number
}

/**
 * What a project should look like after `/forge:harvest` ran on a feature
 * branch. The runner builds the branch: `seed/` committed on main, then
 * `branch/` laid over it and committed on `harness.branch.name`.
 */
export interface HarvestExpectation {
  description: string
  phases: ['harvest']
  harness: {
    branch: { name: string; message: string }
    /** take seed/ from another sample instead of this one */
    seedFrom?: string
  }
  expect: ContentExpect & {
    /** The library is the one the workspace's .forge.json names. */
    library: {
      /** exactly this many lessons */
      count?: number
      lessons?: LibraryLesson[]
      /** no lesson body may match */
      absent?: Array<{ pattern: string; why: string }>
    }
    /** files that must be byte-for-byte as the runner set them up */
    unchanged?: string[]
  }
}

export type Expectation = PhaseExpectation | HarvestExpectation

export const isHarvest = (e: Expectation): e is HarvestExpectation => e.phases?.[0] === 'harvest'

export interface Finding {
  check: string
  message: string
}

const PHASES = ['scope', 'architect', 'design', 'build']
const APPROVALS = ['scope', 'architecture', 'design']

/** Validates an expect.json before a run spends anything on it. */
export function validateExpectation(e: unknown): string[] {
  const errs: string[] = []
  const x = e as Expectation
  if (!x || typeof x !== 'object') return ['not an object']
  if (typeof x.description !== 'string' || !x.description) errs.push('description missing')
  if (Array.isArray(x.phases) && x.phases[0] === 'harvest') return [...errs, ...validateHarvest(x as HarvestExpectation)]
  if (!Array.isArray(x.phases) || x.phases.length === 0) errs.push('phases missing')
  else if (x.phases.some(p => !PHASES.includes(p))) errs.push(`unknown phase in ${x.phases.join(',')}`)
  else if (x.phases[0] !== 'scope') errs.push('phases must start with scope')
  for (const p of (x as PhaseExpectation).harness?.plugins ?? []) {
    if (!p.name || !/^[\w.-]+\/[\w.-]+$/.test(p.repo ?? '') || !/^[0-9a-f]{40}$/.test(p.ref ?? '')) {
      errs.push(`harness plugin needs name, owner/repo, and a 40-char commit SHA: ${JSON.stringify(p)}`)
    }
  }
  const ex = (x as PhaseExpectation).expect
  if (!ex) return [...errs, 'expect missing']
  if (!['throwaway', 'tool', 'product'].includes(ex.sizeClass)) errs.push('expect.sizeClass invalid')
  if (typeof ex.hasUI !== 'boolean') errs.push('expect.hasUI must be boolean')
  if (!Array.isArray(ex.approvals) || ex.approvals.some(a => !APPROVALS.includes(a))) errs.push('expect.approvals invalid')
  if (ex.escalation !== null && !APPROVALS.includes(ex.escalation?.owner as string)) errs.push('expect.escalation invalid')
  return [...errs, ...validateContent(ex)]
}

function validateContent(ex: ContentExpect): string[] {
  const errs: string[] = []
  for (const c of [...(ex.contains ?? []), ...(ex.notContains ?? [])]) {
    if (!c.file || !c.pattern || !c.why) errs.push(`content check needs file, pattern, why: ${JSON.stringify(c)}`)
    else try { new RegExp(c.pattern, 'i') } catch { errs.push(`bad regex: ${c.pattern}`) }
  }
  return errs
}

function validateHarvest(x: HarvestExpectation): string[] {
  const errs: string[] = []
  if (x.phases.length !== 1) errs.push('a harvest sample runs harvest alone')
  const b = x.harness?.branch
  if (!b?.name || !b.message) errs.push('harness.branch needs name and message')
  const lib = x.expect?.library
  if (!lib) return [...errs, 'expect.library missing']
  const regexes = [...(lib.lessons ?? []).map(l => l.match), ...(lib.absent ?? []).map(a => a.pattern)]
  for (const l of lib.lessons ?? []) if (!l.match || !l.why) errs.push(`library lesson needs match and why: ${JSON.stringify(l)}`)
  for (const a of lib.absent ?? []) if (!a.pattern || !a.why) errs.push(`library absent needs pattern and why: ${JSON.stringify(a)}`)
  for (const r of regexes) if (r) try { new RegExp(r, 'i') } catch { errs.push(`bad regex: ${r}`) }
  return [...errs, ...validateContent(x.expect)]
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}

async function readIf(p: string): Promise<string | null> {
  try { return await readFile(p, 'utf8') } catch { return null }
}

async function listSkills(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(dir, '.claude', 'skills'), { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch { return [] }
}

function headings(md: string): string[] {
  return [...md.matchAll(/^##\s+(.+?)\s*$/gm)].map(m => m[1].trim())
}

/** `<…>` placeholders from a template, the ones a filled document must not still contain verbatim. */
function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/<[^<>\n]{3,}>/g)].map(m => m[0]))]
    .filter(p => !p.startsWith('<!--') && !/^<\/?[a-z]+>$/.test(p))
}

function section(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm')
  return md.match(re)?.[1] ?? ''
}

/** Rows of the first markdown table in a block, header and divider excluded. */
function tableRows(block: string): string[][] {
  const lines = block.split('\n').filter(l => l.trim().startsWith('|'))
  return lines.slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
}

/** Workspace-relative files matching a path whose segments may hold `*`. */
async function matchFiles(dir: string, pattern: string): Promise<string[]> {
  let found = ['']
  for (const seg of pattern.split('/')) {
    if (!seg.includes('*')) { found = found.map(f => f ? `${f}/${seg}` : seg); continue }
    const re = new RegExp(`^${seg.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
    const next: string[] = []
    for (const f of found) {
      const names = await readdir(join(dir, f)).catch(() => [] as string[])
      next.push(...names.filter(n => re.test(n)).map(n => f ? `${f}/${n}` : n))
    }
    found = next
  }
  const real: string[] = []
  for (const f of found) if (await exists(join(dir, f))) real.push(f)
  return real
}

/**
 * Checks a workspace that Forge phases have run in. `forgeRoot` is where the
 * templates live, so the document checks follow the templates as they change.
 */
export async function checkProject(dir: string, exp: Expectation, forgeRoot: string): Promise<Finding[]> {
  const out: Finding[] = []
  const fail: Fail = (check, message) => { out.push({ check, message }) }
  if (isHarvest(exp)) await checkHarvest(dir, exp, fail)
  else if (!(await checkPhases(dir, exp, forgeRoot, fail))) return out
  await checkContent(dir, exp.expect, fail)
  return out
}

type Fail = (check: string, message: string) => void

/** The phase run's state, documents, and build output. False when there is no usable state to check further. */
async function checkPhases(dir: string, exp: PhaseExpectation, forgeRoot: string, fail: Fail): Promise<boolean> {
  const tpl = (name: string) => readFile(join(forgeRoot, 'references', 'templates', name), 'utf8')
  const ex = exp.expect

  // --- state.json ---------------------------------------------------------
  const rawState = await readIf(join(dir, 'docs', 'forge', 'state.json'))
  if (!rawState) {
    fail('state', 'docs/forge/state.json missing')
    return false
  }
  let state: Record<string, any>
  try { state = JSON.parse(rawState) } catch {
    fail('state', 'state.json is not valid JSON')
    return false
  }
  if (state.sizeClass !== ex.sizeClass) fail('state.sizeClass', `expected ${ex.sizeClass}, got ${state.sizeClass}`)
  if (state.hasUI !== ex.hasUI) fail('state.hasUI', `expected ${ex.hasUI}, got ${state.hasUI}`)
  const approvals = state.approvals ?? {}
  for (const a of APPROVALS) {
    const stamped = typeof approvals[a] === 'string' && !Number.isNaN(Date.parse(approvals[a]))
    if (ex.approvals.includes(a as any) && !stamped) fail('state.approvals', `${a} should be approved with an ISO timestamp`)
    if (!ex.approvals.includes(a as any) && approvals[a]) fail('state.approvals', `${a} should not be approved`)
  }
  if (ex.escalation === null && state.escalation) fail('state.escalation', `unexpected escalation: ${JSON.stringify(state.escalation)}`)
  if (ex.escalation) {
    if (!state.escalation) fail('state.escalation', `expected an escalation owned by ${ex.escalation.owner}, none open`)
    else {
      if (state.escalation.owner !== ex.escalation.owner) fail('state.escalation', `owner ${state.escalation.owner}, expected ${ex.escalation.owner}`)
      for (const k of ['from', 'conflict', 'proposal', 'raised']) {
        if (!state.escalation[k]) fail('state.escalation', `escalation missing ${k}`)
      }
    }
  }

  // --- documents follow their templates -----------------------------------
  const docs: Array<[string, string, (h: string) => boolean]> = [
    ['docs/forge/scope.md', 'scope.md',
      h => ex.sizeClass !== 'throwaway' || ['Problem', 'Core flows', 'Constraints'].includes(h)],
    ['docs/forge/architecture.md', 'architecture.md', () => true],
    ['DESIGN.md', 'design.md', () => true],
  ]
  for (const [rel, name, required] of docs) {
    const doc = await readIf(join(dir, rel))
    if (doc === null) continue
    const t = await tpl(name)
    const have = new Set(headings(doc))
    for (const h of headings(t).filter(required)) {
      if (!have.has(h)) fail(`template:${rel}`, `missing section "## ${h}"`)
    }
    for (const p of placeholders(t)) {
      if (doc.includes(p)) fail(`template:${rel}`, `unfilled placeholder ${p}`)
    }
  }

  // --- phase outputs exist exactly when the phase should have produced them --
  const has = (rel: string) => exists(join(dir, rel))
  if (ex.approvals.includes('scope') && !(await has('docs/forge/scope.md'))) fail('outputs', 'scope approved but docs/forge/scope.md missing')
  const archApproved = ex.approvals.includes('architecture')
  if (archApproved !== (await has('docs/forge/architecture.md')) && !ex.escalation) {
    fail('outputs', archApproved ? 'architecture approved but architecture.md missing' : 'architecture.md exists but architecture should not have run')
  }
  const designApproved = ex.approvals.includes('design')
  if (designApproved !== (await has('DESIGN.md'))) {
    fail('outputs', designApproved ? 'design approved but DESIGN.md missing' : 'DESIGN.md exists but the design phase should not have produced it')
  }

  const built = exp.phases.includes('build') && !ex.escalation
  if (!built) return true
  const skills = await listSkills(dir)

  {
    for (const rel of ['CLAUDE.md', 'docs/context/status.md', 'docs/context/decisions.md']) {
      if (!(await has(rel))) fail('build', `${rel} missing`)
    }
    const playwright = (await has('playwright.config.ts')) || (await has('playwright.config.js')) ||
      (await has('pytest.ini') && /playwright/i.test((await readIf(join(dir, 'pytest.ini'))) ?? ''))
    const uiBuild = ex.hasUI && ex.sizeClass !== 'throwaway'
    if (uiBuild && !playwright) fail('build.qa', 'UI in scope but no Playwright config')
    if (!ex.hasUI && playwright) fail('build.qa', 'Playwright config present with no UI in scope')
    if (uiBuild && !skills.includes('design-system') && !skills.some(s => /design|ui/.test(s) && s !== 'frontend')) {
      fail('build.skills', 'UI in scope but no design-system skill')
    }

    // generated skills are well-formed
    const skillTpls = await Promise.all(['skill.md', 'qa-skill.md', 'design-system-skill.md'].map(tpl))
    const skillPlaceholders = new Set(skillTpls.flatMap(placeholders))
    for (const s of skills) {
      const body = await readIf(join(dir, '.claude', 'skills', s, 'SKILL.md'))
      if (body === null) { fail('skill', `${s}: SKILL.md missing`); continue }
      let fm: Record<string, unknown>
      try { fm = matter(body).data } catch (e) {
        fail('skill', `${s}: frontmatter is not valid YAML, so the skill will not load — ${(e as Error).message.split('\n')[0]}`)
        continue
      }
      if (!fm.name || !fm.description) fail('skill', `${s}: frontmatter needs name and description`)
      if (!/^##\s+Lessons\s*$/m.test(body)) fail('skill', `${s}: no "## Lessons" section`)
      for (const p of skillPlaceholders) if (body.includes(p)) fail('skill', `${s}: unfilled placeholder ${p}`)
    }

    // CLAUDE.md indexes every generated skill, and links DESIGN.md when there is one
    const claudeMd = (await readIf(join(dir, 'CLAUDE.md'))) ?? ''
    for (const s of skills) if (!claudeMd.includes(s)) fail('build.claude-md', `skills index does not mention ${s}`)
    if (designApproved && !claudeMd.includes('DESIGN.md')) fail('build.claude-md', 'does not link DESIGN.md')

    // the build wrote its commands, and they run
    const rawCommands = await readIf(join(dir, 'docs', 'forge', 'commands.json'))
    let commands: Record<string, unknown> | null = null
    try { commands = rawCommands ? JSON.parse(rawCommands) : null } catch { /* reported below */ }
    if (!commands || typeof commands.test !== 'string') fail('build.commands', 'docs/forge/commands.json missing, invalid, or without a "test" command')
    else if (uiBuild && typeof commands.e2e !== 'string') fail('build.commands', 'UI in scope but commands.json has no "e2e" command')
    const rawVerify = await readIf(join(dir, 'docs', 'eval', 'verify.json'))
    if (rawVerify) {
      const steps = JSON.parse(rawVerify) as Record<string, VerifyStep | 'skipped'>
      if (commands && typeof commands.test === 'string' && !steps.test && !Object.values(steps).some(s => s !== 'skipped' && s.code !== 0)) {
        fail('verify', 'the test command was not run')
      }
      for (const [key, step] of Object.entries(steps)) {
        if (step !== 'skipped' && step.code !== 0) {
          fail('verify', `${key} (\`${step.command}\`) exited ${step.code}:\n${step.tail.split('\n').slice(-8).map(l => '        ' + l).join('\n')}`)
        }
      }
    }

    // the qa skill covers every v1 core flow from the scope
    const qa = await readIf(join(dir, '.claude', 'skills', 'qa', 'SKILL.md'))
    const scope = (await readIf(join(dir, 'docs', 'forge', 'scope.md'))) ?? ''
    if (qa) {
      const v1 = tableRows(section(scope, 'First release')).filter(r => r[1] && /✓|x|yes/i.test(r[1]))
      const mapped = tableRows(section(qa, 'Flow-to-test map'))
      if (v1.length && mapped.length < v1.length) {
        fail('build.qa', `flow-to-test map has ${mapped.length} rows for ${v1.length} v1 flows`)
      }
    }
  }

  return true
}

/** What `/forge:harvest` left in the library and the project. */
async function checkHarvest(dir: string, exp: HarvestExpectation, fail: Fail): Promise<void> {
  const want = exp.expect.library
  const project = await readIf(join(dir, '.forge.json'))
  const libPath = project ? JSON.parse(project).store?.path : null
  if (typeof libPath !== 'string') { fail('harness', 'the workspace has no .forge.json naming a library'); return }
  const libDir = isAbsolute(libPath) ? libPath : join(dir, libPath)

  const lessons: Lesson[] = []
  for (const name of (await readdir(libDir).catch(() => [] as string[])).filter(n => n.endsWith('.md')).sort()) {
    try { lessons.push(parseLesson(await readFile(join(libDir, name), 'utf8'))) } catch (e) {
      fail('library', `${name} is not a valid lesson — ${(e as Error).message}`)
    }
  }
  const ids = lessons.map(l => l.id).join(', ') || 'none'
  if (want.count !== undefined && lessons.length !== want.count) {
    fail('library', `expected ${want.count} lessons, found ${lessons.length}: ${ids}`)
  }
  const tagOk = (have: string[], t: string) =>
    t.endsWith('*') ? have.some(h => h.startsWith(t.slice(0, -1))) : have.includes(t)
  for (const w of want.lessons ?? []) {
    const l = lessons.find(l => (w.id ? l.id === w.id : true) && new RegExp(w.match, 'i').test(l.body))
    if (!l) { fail('library', `no lesson${w.id ? ` ${w.id}` : ''} matching /${w.match}/ (have: ${ids}) — ${w.why}`); continue }
    if (w.status && l.status !== w.status) fail('library', `${l.id} is ${l.status}, expected ${w.status} — ${w.why}`)
    for (const t of w.tags ?? []) if (!tagOk(l.tags, t)) fail('library', `${l.id} lacks tag ${t} (has ${l.tags.join(', ')}) — ${w.why}`)
    if (w.evidence !== undefined && l.evidence.length !== w.evidence) {
      fail('library', `${l.id} has ${l.evidence.length} evidence entries, expected ${w.evidence} — ${w.why}`)
    }
  }
  for (const a of want.absent ?? []) {
    for (const l of lessons) if (new RegExp(a.pattern, 'i').test(l.body)) fail('library', `${l.id} matches /${a.pattern}/ — ${a.why}`)
  }

  const before = JSON.parse((await readIf(join(dir, 'docs', 'eval', 'snapshot.json'))) ?? '{}') as Record<string, string | null>
  for (const f of exp.expect.unchanged ?? []) {
    if (!(f in before)) { fail('harness', `no snapshot of ${f}`); continue }
    if ((await readIf(join(dir, f))) !== before[f]) fail('unchanged', `${f} was changed`)
  }
}

/** Checks every sample makes: the harness could read Forge, and the sample's own file expectations. */
async function checkContent(dir: string, ex: ContentExpect, fail: Fail): Promise<void> {
  const has = (rel: string) => exists(join(dir, rel))
  // --- the phases could reach Forge's own templates and references ----------
  const assumptions = (await readIf(join(dir, 'docs', 'eval', 'assumptions.md'))) ?? ''
  const unreadable = assumptions.split('\n').some(l =>
    /template|references?\b|SKILL\.md|discriminators/i.test(l) && !/lesson/i.test(l) &&
    /not (be )?readable|permission denied|outside (the|this) working directory|could not (read|find)|couldn't (read|find)/i.test(l))
  if (unreadable) {
    fail('harness', 'a phase could not read Forge templates or references — see docs/eval/assumptions.md')
  }

  // --- the sample's own expectations ---------------------------------------
  const skills = await listSkills(dir)
  for (const s of ex.skills?.present ?? []) if (!skills.includes(s)) fail('skills', `expected skill ${s}`)
  for (const s of ex.skills?.absent ?? []) if (skills.includes(s)) fail('skills', `unexpected skill ${s}`)
  for (const f of ex.files?.present ?? []) if (!(await has(f))) fail('files', `expected ${f}`)
  for (const f of ex.files?.absent ?? []) if (await has(f)) fail('files', `unexpected ${f}`)
  for (const c of ex.contains ?? []) {
    const files = await matchFiles(dir, c.file)
    const bodies = await Promise.all(files.map(f => readIf(join(dir, f))))
    if (!files.length) fail('contains', `${c.file} missing (${c.why})`)
    else if (!bodies.some(b => b !== null && new RegExp(c.pattern, 'i').test(b))) fail('contains', `${c.file} lacks /${c.pattern}/ — ${c.why}`)
  }
  for (const c of ex.notContains ?? []) {
    for (const f of await matchFiles(dir, c.file)) {
      const body = await readIf(join(dir, f))
      if (body !== null && new RegExp(c.pattern, 'i').test(body)) fail('notContains', `${f} has /${c.pattern}/ — ${c.why}`)
    }
  }

}
