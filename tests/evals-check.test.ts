import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import {
  checkProject, isHarvest, validateExpectation, type Expectation, type HarvestExpectation, type PhaseExpectation,
} from '../evals/src/check.js'
import { serializeLesson, type Lesson } from '../src/lesson.js'

const FORGE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'forge-evalcheck-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

async function put(rel: string, body: string) {
  await mkdir(dirname(join(dir, rel)), { recursive: true })
  await writeFile(join(dir, rel), body)
}

const skill = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: ${name} standard for the test project.\n---\n\n# ${name}\n\n${extra}\n\n## Lessons\n`

const apiTool: PhaseExpectation = {
  description: 'api tool',
  phases: ['scope', 'architect', 'design', 'build'],
  expect: {
    sizeClass: 'tool', hasUI: false, approvals: ['scope', 'architecture'], escalation: null,
    skills: { present: ['backend', 'qa'], absent: ['frontend'] },
    contains: [{ file: '.claude/skills/qa/SKILL.md', pattern: 'signature', why: 'flow 1' }],
  },
}

/** A minimal workspace that satisfies `apiTool`. Tests break one thing at a time. */
async function goodApiWorkspace() {
  const scopeTpl = await readFile(join(FORGE, 'references/templates/scope.md'), 'utf8')
  const archTpl = await readFile(join(FORGE, 'references/templates/architecture.md'), 'utf8')
  const filled = (tpl: string) =>
    tpl.split('\n').filter(l => l.startsWith('#')).map(l => l.replace(/<[^>]+>/g, 'relay')).join('\n\nfilled\n\n')
  await put('docs/forge/state.json', JSON.stringify({
    phase: 'build', sizeClass: 'tool', hasUI: false,
    approvals: { scope: '2026-10-14T10:00:00Z', architecture: '2026-10-14T11:00:00Z' }, escalation: null,
  }))
  await put('docs/forge/scope.md', filled(scopeTpl).replace('## First release',
    '## First release\n\n| Flow | v1 | Later |\n|---|---|---|\n| receive | ✓ | |\n| deliver | ✓ | |\n| replay | | ✓ |'))
  await put('docs/forge/architecture.md', filled(archTpl))
  await put('docs/context/status.md', 'status')
  await put('docs/context/decisions.md', 'decisions')
  await put('.claude/skills/backend/SKILL.md', skill('backend'))
  await put('.claude/skills/qa/SKILL.md', skill('qa',
    '## Flow-to-test map\n\n| Flow | Spec | Status |\n|---|---|---|\n| receive (signature) | a | planned |\n| deliver | b | planned |'))
  await put('CLAUDE.md', 'skills: backend, qa')
  await put('docs/forge/commands.json', JSON.stringify({ install: 'go mod download', test: 'go test ./...' }))
}

describe('checkProject', () => {
  it('passes a workspace that matches its expectation', async () => {
    await goodApiWorkspace()
    expect(await checkProject(dir, apiTool, FORGE)).toEqual([])
  })

  it('reports a missing state file and stops', async () => {
    const f = await checkProject(dir, apiTool, FORGE)
    expect(f).toHaveLength(1)
    expect(f[0].check).toBe('state')
  })

  it('catches a wrong size class and a stray approval', async () => {
    await goodApiWorkspace()
    await put('docs/forge/state.json', JSON.stringify({
      sizeClass: 'product', hasUI: false, escalation: null,
      approvals: { scope: '2026-10-14T10:00:00Z', architecture: '2026-10-14T11:00:00Z', design: '2026-10-14T12:00:00Z' },
    }))
    const checks = (await checkProject(dir, apiTool, FORGE)).map(f => f.check)
    expect(checks).toContain('state.sizeClass')
    expect(checks).toContain('state.approvals')
  })

  it('catches a DESIGN.md the design phase should have refused to write', async () => {
    await goodApiWorkspace()
    await put('DESIGN.md', '# design')
    expect((await checkProject(dir, apiTool, FORGE)).some(f => /DESIGN\.md exists/.test(f.message))).toBe(true)
  })

  it('catches unfilled template placeholders', async () => {
    await goodApiWorkspace()
    await put('docs/forge/architecture.md', '# Architecture — <project name>\n')
    const msgs = (await checkProject(dir, apiTool, FORGE)).map(f => f.message)
    expect(msgs).toContain('unfilled placeholder <project name>')
    expect(msgs.some(m => m.includes('missing section "## Chosen stack"'))).toBe(true)
  })

  it('catches a qa flow map that does not cover every v1 flow', async () => {
    await goodApiWorkspace()
    await put('.claude/skills/qa/SKILL.md', skill('qa',
      'signature\n\n## Flow-to-test map\n\n| Flow | Spec | Status |\n|---|---|---|\n| receive | a | planned |'))
    expect((await checkProject(dir, apiTool, FORGE)).some(f => /1 rows for 2 v1 flows/.test(f.message))).toBe(true)
  })

  it('catches a malformed generated skill and a CLAUDE.md that does not index it', async () => {
    await goodApiWorkspace()
    await put('.claude/skills/devops/SKILL.md', '# devops, no frontmatter, no lessons')
    const msgs = (await checkProject(dir, apiTool, FORGE)).map(f => f.message)
    expect(msgs).toContain('devops: frontmatter needs name and description')
    expect(msgs).toContain('devops: no "## Lessons" section')
    expect(msgs).toContain('skills index does not mention devops')
  })

  it('reports a generated skill whose frontmatter is not valid YAML', async () => {
    await goodApiWorkspace()
    await put('.claude/skills/backend/SKILL.md',
      '---\nname: backend\ndescription: Use for server code: actions, lib/auth\n---\n\n## Lessons\n')
    expect((await checkProject(dir, apiTool, FORGE)).some(f => /backend: frontmatter is not valid YAML/.test(f.message))).toBe(true)
  })

  it('accepts every Forge template once filled, frontmatter included', async () => {
    for (const t of ['skill.md', 'qa-skill.md', 'design-system-skill.md', 'gitflow-skill.md', 'security-skill.md']) {
      const body = await readFile(join(FORGE, 'references/templates', t), 'utf8')
      // a skill name is a slug; every other placeholder gets a colon-space, the YAML trap
      const filled = body.replace(/^name: <[^>]+>$/m, 'name: x').replace(/<[^<>\n]+>/g, 'x: y')
      expect(() => matter(filled), t).not.toThrow()
    }
  })

  it('catches a forbidden skill, a missing skill, and a failed content check', async () => {
    await goodApiWorkspace()
    await put('.claude/skills/frontend/SKILL.md', skill('frontend'))
    await rm(join(dir, '.claude/skills/backend'), { recursive: true })
    await put('.claude/skills/qa/SKILL.md', skill('qa'))
    const msgs = (await checkProject(dir, apiTool, FORGE)).map(f => f.message)
    expect(msgs).toContain('unexpected skill frontend')
    expect(msgs).toContain('expected skill backend')
    expect(msgs.some(m => m.includes('lacks /signature/'))).toBe(true)
  })

  it('requires Playwright when a non-throwaway project has UI', async () => {
    await goodApiWorkspace()
    const ui: PhaseExpectation = { ...apiTool, expect: { ...apiTool.expect, hasUI: true, skills: {}, contains: [] } }
    await put('docs/forge/state.json', JSON.stringify({
      sizeClass: 'tool', hasUI: true, escalation: null,
      approvals: { scope: '2026-10-14T10:00:00Z', architecture: '2026-10-14T11:00:00Z' },
    }))
    expect((await checkProject(dir, ui, FORGE)).some(f => f.message === 'UI in scope but no Playwright config')).toBe(true)
  })

  it('requires commands.json with a test command after build', async () => {
    await goodApiWorkspace()
    await rm(join(dir, 'docs/forge/commands.json'))
    expect((await checkProject(dir, apiTool, FORGE)).some(f => f.check === 'build.commands')).toBe(true)
  })

  it('fails when the generated project\'s own tests fail, and passes when they ran green', async () => {
    await goodApiWorkspace()
    await put('docs/eval/verify.json', JSON.stringify({
      install: { command: 'go mod download', code: 0, tail: '' },
      test: { command: 'go test ./...', code: 1, tail: 'FAIL internal/ingest' },
    }))
    const f = await checkProject(dir, apiTool, FORGE)
    expect(f.some(x => x.check === 'verify' && /test .*exited 1/.test(x.message) && /FAIL internal\/ingest/.test(x.message))).toBe(true)
    await put('docs/eval/verify.json', JSON.stringify({
      install: { command: 'go mod download', code: 0, tail: '' },
      test: { command: 'go test ./...', code: 0, tail: 'ok' },
      e2e: 'skipped',
    }))
    expect(await checkProject(dir, apiTool, FORGE)).toEqual([])
  })

  it('reports a test command that was never run', async () => {
    await goodApiWorkspace()
    await put('docs/eval/verify.json', JSON.stringify({ install: { command: 'go mod download', code: 0, tail: '' } }))
    expect((await checkProject(dir, apiTool, FORGE)).some(f => f.message === 'the test command was not run')).toBe(true)
  })

  it('flags a run where a phase could not read the Forge templates', async () => {
    await goodApiWorkspace()
    await put('docs/eval/assumptions.md', '- Forge templates under /x were not readable in this run (permission denied).')
    expect((await checkProject(dir, apiTool, FORGE)).some(f => f.check === 'harness')).toBe(true)
  })

  it('does not mistake an unreachable lesson library for unreadable templates', async () => {
    await goodApiWorkspace()
    await put('docs/eval/assumptions.md', '- Architecture: lesson library not readable from this sandbox; no lessons informed trade-offs.')
    expect(await checkProject(dir, apiTool, FORGE)).toEqual([])
  })

  it('accepts an open escalation when one is expected, and checks its owner', async () => {
    const esc: Expectation = {
      description: 'contradiction', phases: ['scope', 'architect'],
      expect: { sizeClass: 'product', hasUI: true, approvals: ['scope'], escalation: { owner: 'scope' } },
    }
    await put('docs/forge/scope.md', '# Scope')
    const state = (owner: string) => JSON.stringify({
      sizeClass: 'product', hasUI: true, approvals: { scope: '2026-10-14T10:00:00Z' },
      escalation: { from: 'architecture', owner, conflict: 'c', proposal: 'p', raised: '2026-10-14T11:00:00Z' },
    })
    await put('docs/forge/state.json', state('scope'))
    expect((await checkProject(dir, esc, FORGE)).filter(f => f.check.startsWith('state'))).toEqual([])
    await put('docs/forge/state.json', state('architecture'))
    expect((await checkProject(dir, esc, FORGE)).some(f => /owner architecture, expected scope/.test(f.message))).toBe(true)
  })
})

describe('checkProject — harvest', () => {
  const harvest: HarvestExpectation = {
    description: 'harvest', phases: ['harvest'],
    harness: { branch: { name: 'b', message: 'm' } },
    expect: {
      library: {
        count: 2,
        lessons: [
          { match: 'raw body', status: 'observed', tags: ['skill:*'], evidence: 1, why: 'new lesson' },
          { id: 'busy', match: 'busy', status: 'confirmed', evidence: 2, why: 'second sighting' },
        ],
        absent: [{ pattern: 'typo', why: 'trivia' }],
      },
      unchanged: ['CLAUDE.md'],
      contains: [{ file: '.claude/skills/*/SKILL.md', pattern: '1-based', why: 'project lesson' }],
      notContains: [{ file: '.claude/skills/*/SKILL.md', pattern: 'not indexed yet', why: 'pruned' }],
    },
  }
  const ev = (ref: string) => ({ project: 'p', ref, date: '2026-10-01' })
  const lesson = (id: string, body: string, over: Partial<Lesson> = {}): string => serializeLesson({
    id, scope: 'portable', status: 'observed', tags: ['stack:any', 'skill:backend'],
    evidence: [ev('PR #1')], retired_reason: null, body, ...over,
  })

  async function goodHarvest() {
    await put('.forge.json', JSON.stringify({ store: { backend: 'local', path: 'lib' } }))
    await put('lib/raw.md', lesson('raw', 'Verify signatures over the raw body.'))
    await put('lib/busy.md', lesson('busy', 'Set a busy timeout.', { status: 'confirmed', evidence: [ev('PR #1'), ev('PR #2')] }))
    await put('.claude/skills/database/SKILL.md', skill('database', '- attempt is 1-based'))
    await put('.claude/skills/backend/SKILL.md', skill('backend'))
    await put('CLAUDE.md', 'index')
    await put('docs/eval/snapshot.json', JSON.stringify({ 'CLAUDE.md': 'index' }))
  }

  it('passes a harvest that did what it should', async () => {
    await goodHarvest()
    expect(await checkProject(dir, harvest, FORGE)).toEqual([])
  })

  it('catches a second sighting written as a new lesson instead of promoting the old one', async () => {
    await goodHarvest()
    await put('lib/busy.md', lesson('busy', 'Set a busy timeout.'))
    await put('lib/busy-again.md', lesson('busy-again', 'SQLite needs a busy timeout.', { evidence: [ev('PR #2')] }))
    const msgs = (await checkProject(dir, harvest, FORGE)).map(f => f.message)
    expect(msgs.some(m => /expected 2 lessons, found 3/.test(m))).toBe(true)
    expect(msgs.some(m => /busy is observed, expected confirmed/.test(m))).toBe(true)
    expect(msgs.some(m => /busy has 1 evidence entries, expected 2/.test(m))).toBe(true)
  })

  it('catches a missing lesson, a missing skill tag, an unapproved lesson, and an invalid file', async () => {
    await goodHarvest()
    await put('lib/raw.md', lesson('raw', 'Verify signatures over the raw body.', { tags: ['stack:any'] }))
    await put('lib/busy.md', lesson('busy', 'Fixed a typo. busy', { status: 'confirmed', evidence: [ev('a'), ev('b')] }))
    await put('lib/broken.md', '---\nid: Not Kebab\n---\nx')
    const msgs = (await checkProject(dir, harvest, FORGE)).map(f => f.message)
    expect(msgs.some(m => /raw lacks tag skill:\*/.test(m))).toBe(true)
    expect(msgs.some(m => /busy matches \/typo\//.test(m))).toBe(true)
    expect(msgs.some(m => /broken\.md is not a valid lesson/.test(m))).toBe(true)
    await rm(join(dir, 'lib/raw.md'))
    expect((await checkProject(dir, harvest, FORGE)).some(f => /no lesson matching \/raw body\//.test(f.message))).toBe(true)
  })

  it('checks content across a skills glob, and files that must stay unchanged', async () => {
    await goodHarvest()
    await put('.claude/skills/database/SKILL.md', skill('database', '- deliveries.status is not indexed yet'))
    await put('CLAUDE.md', 'index, edited')
    const f = await checkProject(dir, harvest, FORGE)
    expect(f.some(x => x.check === 'contains' && /\*\/SKILL\.md lacks \/1-based\//.test(x.message))).toBe(true)
    expect(f.some(x => x.check === 'notContains' && x.message.startsWith('.claude/skills/database/SKILL.md has'))).toBe(true)
    expect(f.some(x => x.check === 'unchanged' && /CLAUDE\.md was changed/.test(x.message))).toBe(true)
  })

  it('reports a workspace without a library as a harness problem', async () => {
    expect((await checkProject(dir, harvest, FORGE)).map(f => f.check)).toContain('harness')
  })

  it('validates a harvest expectation', () => {
    expect(validateExpectation(harvest)).toEqual([])
    expect(validateExpectation({ ...harvest, harness: {} }).join()).toMatch(/harness.branch needs name and message/)
    expect(validateExpectation({ ...harvest, phases: ['harvest', 'scope'] }).join()).toMatch(/runs harvest alone/)
    const noLib = { ...harvest, expect: { ...harvest.expect, library: undefined } }
    expect(validateExpectation(noLib).join()).toMatch(/expect.library missing/)
  })
})

describe('sample projects', async () => {
  const root = join(FORGE, 'evals', 'projects')
  const names = (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name)

  it('rejects an unpinned harness plugin', () => {
    const exp = JSON.parse(JSON.stringify(apiTool))
    exp.harness = { plugins: [{ name: 'x', repo: 'owner/x', ref: 'main' }] }
    expect(validateExpectation(exp).join()).toMatch(/40-char commit SHA/)
  })

  it('exist', () => { expect(names.length).toBeGreaterThanOrEqual(5) })

  for (const name of names) {
    it(`${name} has a valid expect.json and a brief with answers and approvals`, async () => {
      const exp = JSON.parse(await readFile(join(root, name, 'expect.json'), 'utf8'))
      expect(validateExpectation(exp)).toEqual([])
      const brief = await readFile(join(root, name, 'brief.md'), 'utf8')
      expect(brief).toMatch(/^## Answers$/m)
      expect(brief).toMatch(/^## Approvals$/m)
    })
  }

  it('together cover every size class, UI and no-UI, an escalation, a run with external design skills, and the harvest', async () => {
    const every: Expectation[] = await Promise.all(names.map(async n =>
      JSON.parse(await readFile(join(root, n, 'expect.json'), 'utf8'))))
    const all = every.filter((e): e is PhaseExpectation => !isHarvest(e))
    const classes = new Set(all.map(e => e.expect.sizeClass))
    expect([...classes].sort()).toEqual(['product', 'throwaway', 'tool'])
    expect(all.some(e => e.expect.hasUI)).toBe(true)
    expect(all.some(e => !e.expect.hasUI && e.expect.sizeClass !== 'throwaway')).toBe(true)
    expect(all.some(e => e.expect.escalation)).toBe(true)
    expect(all.some(e => e.harness?.plugins?.length)).toBe(true)
    // the harvest: one that has lessons to fold in, one that has none
    const harvests = every.filter(isHarvest)
    expect(harvests.some(e => e.expect.library.lessons?.some(l => l.status === 'confirmed'))).toBe(true)
    expect(harvests.some(e => e.expect.unchanged?.length)).toBe(true)
  })
})
