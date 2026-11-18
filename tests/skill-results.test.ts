import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { END, START, loadResults, main, renderBlock, replaceBlock } from '../src/skill-results.js'

let dir: string

function report(path: string, over: Record<string, unknown> = {}) {
  return {
    version: '1.0.1', target_path: path, overall_passed: true, overall_status: 'passed', incomplete_scans: [],
    severity_counts: { critical: 0, high: 0, medium: 4, low: 7 },
    results: [
      { validator: 'Security Scan', skillspector_version: '2.13.4' },
      { validator: 'QUALITY', quality: { overall_score: 89.8, grade: 'B' } },
    ],
    ...over,
  }
}

async function put(rel: string, data: unknown) {
  await mkdir(join(dir, rel, '..'), { recursive: true })
  await writeFile(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data))
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'forge-skill-results-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('loadResults', () => {
  it('reads the CI evidence artifact, taking the verdict from summary.json', async () => {
    await put('ev/summary.json', { skills: [
      { path: 'skills/store', report_dir: 'skill-001', passed: false, overall_status: 'failed' },
      { path: 'skills/architect', report_dir: 'skill-002', passed: true, overall_status: 'passed' },
    ] })
    await put('ev/skill-001/skillevaluator-tier1.json', report('skills/store', {
      severity_counts: { critical: 0, high: 1, medium: 5, low: 6 },
      results: [{ validator: 'QUALITY', quality: { overall_score: 91.5, grade: 'A' } }],
    }))
    await put('ev/skill-002/skillevaluator-tier1.json', report('skills/architect'))

    const r = await loadResults(join(dir, 'ev'))
    expect(r.evaluator).toBe('1.0.1')
    expect(r.skillspector).toBe('2.13.4')
    expect(r.skills.map(s => [s.skill, s.passed, s.status, s.score])).toEqual([
      ['architect', true, 'passed', 89.8],
      ['store', false, 'failed', 91.5],
    ])
  })

  it('reports a skill that CI selected but never scanned as a failure', async () => {
    await put('ev/summary.json', { skills: [{ path: 'skills/build', report_dir: 'skill-001', passed: false, overall_status: 'error' }] })
    const r = await loadResults(join(dir, 'ev'))
    expect(r.skills).toEqual([expect.objectContaining({ skill: 'build', passed: false, status: 'error', score: null })])
  })

  it('reads local tier1 output without a summary, and an incomplete scan does not pass', async () => {
    await put('local/design/skillevaluator-tier1.json', report('skills/design'))
    await put('local/scope/skillevaluator-tier1.json', report('skills/scope', {
      overall_passed: false, overall_status: 'incomplete', incomplete_scans: ['skillspector'],
    }))
    const r = await loadResults(join(dir, 'local'))
    expect(r.skills.map(s => [s.skill, s.passed, s.status])).toEqual([['design', true, 'passed'], ['scope', false, 'incomplete']])
  })
})

describe('renderBlock', () => {
  it('renders the headline and one row per skill, with no date or run link', () => {
    const block = renderBlock({ evaluator: '1.0.1', skillspector: '2.13.4', skills: [
      { skill: 'architect', passed: true, status: 'passed', score: 89.8, grade: 'B', severity: { critical: 0, high: 0, medium: 4, low: 7 } },
      { skill: 'store', passed: false, status: 'failed', score: null, grade: null, severity: { critical: 0, high: 1, medium: 0, low: 0 } },
    ] })
    expect(block.startsWith(START) && block.endsWith(END)).toBe(true)
    expect(block).toMatch(/\*\*1 of 2 skills pass\*\* NVIDIA SkillEvaluator 1\.0\.1 \(SkillSpector 2\.13\.4\) Tier 1/)
    expect(block).toMatch(/^\| `architect` \| ✅ pass \| 89\.8 \(B\) \| 0 \/ 0 \/ 4 \/ 7 \|$/m)
    expect(block).toMatch(/^\| `store` \| ❌ failed \| — \| 0 \/ 1 \/ 0 \/ 0 \|$/m)
    expect(block).not.toMatch(/20\d\d-\d\d|https?:/)
  })
})

describe('replaceBlock', () => {
  it('replaces only the marked block', () => {
    expect(replaceBlock(`a\n${START}\nold\n${END}\nb`, `${START}\nnew\n${END}`)).toBe(`a\n${START}\nnew\n${END}\nb`)
  })

  it('refuses a README without markers', () => {
    expect(() => replaceBlock('no markers', 'x')).toThrow(/no <!-- skill-checks:start -->/)
  })
})

describe('main', () => {
  it('writes the README, then --check passes; a changed scan fails --check and prints the new block', async () => {
    await put('ev/summary.json', { skills: [{ path: 'skills/architect', report_dir: 'skill-001', passed: true, overall_status: 'passed' }] })
    await put('ev/skill-001/skillevaluator-tier1.json', report('skills/architect'))
    const readme = join(dir, 'README.md')
    await writeFile(readme, `# X\n\n${START}\n${END}\n\nrest\n`)
    const out: string[] = []
    const log = (s: string) => out.push(s)

    expect(await main([join(dir, 'ev'), '--readme', readme], log)).toBe(0)
    expect(await readFile(readme, 'utf8')).toMatch(/\| `architect` \| ✅ pass \| 89\.8 \(B\)/)
    expect(await main([join(dir, 'ev'), '--readme', readme, '--check'], log)).toBe(0)
    expect(out.pop()).toBe('the README skill-check results match this scan')

    await put('ev/skill-001/skillevaluator-tier1.json', report('skills/architect', {
      results: [{ validator: 'QUALITY', quality: { overall_score: 75.0, grade: 'C' } }],
    }))
    expect(await main([join(dir, 'ev'), '--readme', readme, '--check'], log)).toBe(1)
    expect(out.join('\n')).toMatch(/do not match[\s\S]*75\.0 \(C\)/)
    expect(await readFile(readme, 'utf8')).toMatch(/89\.8/) // --check never writes
  })

  it('fails when the folder holds no reports', async () => {
    await mkdir(join(dir, 'empty'))
    await writeFile(join(dir, 'README.md'), `${START}\n${END}`)
    expect(await main([join(dir, 'empty'), '--readme', join(dir, 'README.md'), '--check'], () => {})).toBe(1)
  })
})
