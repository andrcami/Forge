/**
 * Renders NVIDIA SkillEvaluator Tier 1 results into the README, between
 * marker comments, so the published table is the one CI measured.
 *
 *   tsx src/skill-results.ts <evidence-dir> [--readme README.md] [--check]
 *
 * <evidence-dir> is the `skill-evaluator-tier1-evidence-attempt-N` artifact
 * (summary.json plus skill-NNN/skillevaluator-tier1.json), or any folder that
 * holds skillevaluator-tier1.json reports, such as local `tier1 -o` output.
 * Without --check the README is rewritten; with it, the run fails when the
 * README does not match, and prints the block that it should hold.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const START = '<!-- skill-checks:start -->'
export const END = '<!-- skill-checks:end -->'

export interface SkillResult {
  skill: string
  passed: boolean
  status: string
  score: number | null
  grade: string | null
  severity: { critical: number; high: number; medium: number; low: number }
}

export interface Results {
  evaluator: string | null
  skillspector: string | null
  skills: SkillResult[]
}

interface Tier1Report {
  version?: string
  target_path?: string
  overall_passed?: boolean
  overall_status?: string
  incomplete_scans?: unknown[]
  severity_counts?: Partial<SkillResult['severity']>
  results?: { validator?: string; quality?: { overall_score?: number; grade?: string }; skillspector_version?: string }[]
}

interface SummaryRow { path: string; report_dir: string; passed: boolean; overall_status: string }

async function findReports(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await findReports(p))
    else if (e.name === 'skillevaluator-tier1.json') out.push(p)
  }
  return out
}

/** Reads the evidence. summary.json, when present, is the CI verdict per skill. */
export async function loadResults(dir: string): Promise<Results> {
  let summary: SummaryRow[] = []
  try {
    summary = (JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8')) as { skills: SummaryRow[] }).skills
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const results: Results = { evaluator: null, skillspector: null, skills: [] }
  const seen = new Set<string>()
  for (const file of (await findReports(dir)).sort()) {
    const r = JSON.parse(await readFile(file, 'utf8')) as Tier1Report
    const reportDir = relative(dir, file).split(sep)[0]
    const row = summary.find(s => s.report_dir === reportDir)
    const path = row?.path ?? r.target_path ?? reportDir
    const skill = path.split('/').filter(Boolean).pop() ?? path
    const quality = r.results?.find(v => v.validator === 'QUALITY')?.quality
    const sev = r.severity_counts ?? {}
    results.evaluator ??= r.version ?? null
    results.skillspector ??= r.results?.find(v => v.skillspector_version)?.skillspector_version ?? null
    results.skills.push({
      skill,
      passed: row ? row.passed : r.overall_passed === true && r.overall_status === 'passed' && !r.incomplete_scans?.length,
      status: row?.overall_status ?? r.overall_status ?? 'unknown',
      score: quality?.overall_score ?? null,
      grade: quality?.grade ?? null,
      severity: { critical: sev.critical ?? 0, high: sev.high ?? 0, medium: sev.medium ?? 0, low: sev.low ?? 0 },
    })
    seen.add(path)
  }
  // a skill CI selected but never reported on is a failure, not an absence
  for (const row of summary) {
    if (!seen.has(row.path)) {
      results.skills.push({
        skill: row.path.split('/').pop() ?? row.path, passed: false, status: row.overall_status,
        score: null, grade: null, severity: { critical: 0, high: 0, medium: 0, low: 0 },
      })
    }
  }
  results.skills.sort((a, b) => a.skill.localeCompare(b.skill))
  return results
}

/** The README block. No dates or run links: the same scan must render the same text. */
export function renderBlock(r: Results): string {
  const passed = r.skills.filter(s => s.passed).length
  const scanner = `NVIDIA SkillEvaluator${r.evaluator ? ` ${r.evaluator}` : ''}` +
    (r.skillspector ? ` (SkillSpector ${r.skillspector})` : '')
  const rows = r.skills.map(s =>
    `| \`${s.skill}\` | ${s.passed ? '✅ pass' : `❌ ${s.status}`} | ` +
    `${s.score === null ? '—' : `${s.score.toFixed(1)}${s.grade ? ` (${s.grade})` : ''}`} | ` +
    `${s.severity.critical} / ${s.severity.high} / ${s.severity.medium} / ${s.severity.low} |`)
  return [
    START,
    `**${passed} of ${r.skills.length} skills pass** ${scanner} Tier 1: schema, security, PII, secrets,`,
    'licence, Unicode smuggling, code risk, link integrity and quality, with a quality score of 70 or more.',
    '',
    '| Skill | Verdict | Quality / 100 | Findings (critical / high / medium / low) |',
    '|---|---|---|---|',
    ...rows,
    END,
  ].join('\n')
}

export function replaceBlock(readme: string, block: string): string {
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`the README has no ${START} … ${END} block to fill`)
  }
  return readme.slice(0, start) + block + readme.slice(end + END.length)
}

export async function main(argv: string[], out = (s: string) => console.log(s)): Promise<number> {
  const check = argv.includes('--check')
  const i = argv.indexOf('--readme')
  const readmePath = resolve(i >= 0 ? argv[i + 1] : 'README.md')
  const dir = argv.find((a, n) => !a.startsWith('--') && argv[n - 1] !== '--readme')
  if (!dir) { out('usage: skill-results <evidence-dir> [--readme README.md] [--check]'); return 2 }

  const results = await loadResults(resolve(dir))
  if (results.skills.length === 0) { out(`no skillevaluator-tier1.json reports under ${dir}`); return 1 }
  const block = renderBlock(results)
  const readme = await readFile(readmePath, 'utf8')
  const next = replaceBlock(readme, block)
  if (!check) {
    await writeFile(readmePath, next)
    out(`updated ${readmePath}`)
    return 0
  }
  if (next === readme) { out('the README skill-check results match this scan'); return 0 }
  out('The README skill-check results do not match this scan. Replace the block in README.md with:\n')
  out(block)
  out('\nor run: npm run skills:readme -- <the downloaded evidence artifact folder>')
  return 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code })
}
