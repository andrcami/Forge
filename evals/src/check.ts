import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

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

/** What a sample project should look like after the phases it lists have run. */
export interface Expectation {
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
  expect: {
    sizeClass: 'throwaway' | 'tool' | 'product'
    hasUI: boolean
    /** Approvals that must be stamped. Any approval not listed must be absent. */
    approvals: Array<'scope' | 'architecture' | 'design'>
    /** null: no escalation may be open. An object: one must be, owned by this phase. */
    escalation: null | { owner: 'scope' | 'architecture' | 'design' }
    skills?: { present?: string[]; absent?: string[] }
    files?: { present?: string[]; absent?: string[] }
    contains?: Array<{ file: string; pattern: string; why: string }>
    notContains?: Array<{ file: string; pattern: string; why: string }>
  }
}

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
  if (!Array.isArray(x.phases) || x.phases.length === 0) errs.push('phases missing')
  else if (x.phases.some(p => !PHASES.includes(p))) errs.push(`unknown phase in ${x.phases.join(',')}`)
  else if (x.phases[0] !== 'scope') errs.push('phases must start with scope')
  for (const p of x.harness?.plugins ?? []) {
    if (!p.name || !/^[\w.-]+\/[\w.-]+$/.test(p.repo ?? '') || !/^[0-9a-f]{40}$/.test(p.ref ?? '')) {
      errs.push(`harness plugin needs name, owner/repo, and a 40-char commit SHA: ${JSON.stringify(p)}`)
    }
  }
  const ex = x.expect
  if (!ex) return [...errs, 'expect missing']
  if (!['throwaway', 'tool', 'product'].includes(ex.sizeClass)) errs.push('expect.sizeClass invalid')
  if (typeof ex.hasUI !== 'boolean') errs.push('expect.hasUI must be boolean')
  if (!Array.isArray(ex.approvals) || ex.approvals.some(a => !APPROVALS.includes(a))) errs.push('expect.approvals invalid')
  if (ex.escalation !== null && !APPROVALS.includes(ex.escalation?.owner as string)) errs.push('expect.escalation invalid')
  for (const c of [...(ex.contains ?? []), ...(ex.notContains ?? [])]) {
    if (!c.file || !c.pattern || !c.why) errs.push(`content check needs file, pattern, why: ${JSON.stringify(c)}`)
    else try { new RegExp(c.pattern, 'i') } catch { errs.push(`bad regex: ${c.pattern}`) }
  }
  return errs
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

/**
 * Checks a workspace that Forge phases have run in. `forgeRoot` is where the
 * templates live, so the document checks follow the templates as they change.
 */
export async function checkProject(dir: string, exp: Expectation, forgeRoot: string): Promise<Finding[]> {
  const out: Finding[] = []
  const fail = (check: string, message: string) => out.push({ check, message })
  const tpl = (name: string) => readFile(join(forgeRoot, 'references', 'templates', name), 'utf8')
  const ex = exp.expect

  // --- state.json ---------------------------------------------------------
  const rawState = await readIf(join(dir, 'docs', 'forge', 'state.json'))
  if (!rawState) {
    fail('state', 'docs/forge/state.json missing')
    return out
  }
  let state: Record<string, any>
  try { state = JSON.parse(rawState) } catch {
    fail('state', 'state.json is not valid JSON')
    return out
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
  const skills = await listSkills(dir)

  if (built) {
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

  // --- the phases could reach Forge's own templates and references ----------
  const assumptions = (await readIf(join(dir, 'docs', 'eval', 'assumptions.md'))) ?? ''
  const unreadable = assumptions.split('\n').some(l =>
    /template|references?\b|SKILL\.md|discriminators/i.test(l) && !/lesson/i.test(l) &&
    /not (be )?readable|permission denied|outside (the|this) working directory|could not (read|find)|couldn't (read|find)/i.test(l))
  if (unreadable) {
    fail('harness', 'a phase could not read Forge templates or references — see docs/eval/assumptions.md')
  }

  // --- the sample's own expectations ---------------------------------------
  for (const s of ex.skills?.present ?? []) if (!skills.includes(s)) fail('skills', `expected skill ${s}`)
  for (const s of ex.skills?.absent ?? []) if (skills.includes(s)) fail('skills', `unexpected skill ${s}`)
  for (const f of ex.files?.present ?? []) if (!(await has(f))) fail('files', `expected ${f}`)
  for (const f of ex.files?.absent ?? []) if (await has(f)) fail('files', `unexpected ${f}`)
  for (const c of ex.contains ?? []) {
    const body = await readIf(join(dir, c.file))
    if (body === null) fail('contains', `${c.file} missing (${c.why})`)
    else if (!new RegExp(c.pattern, 'i').test(body)) fail('contains', `${c.file} lacks /${c.pattern}/ — ${c.why}`)
  }
  for (const c of ex.notContains ?? []) {
    const body = await readIf(join(dir, c.file))
    if (body !== null && new RegExp(c.pattern, 'i').test(body)) fail('notContains', `${c.file} has /${c.pattern}/ — ${c.why}`)
  }

  return out
}
