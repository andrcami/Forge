/**
 * The eval receipt: proof, committed with a change, that the eval samples
 * passed against exactly the instructions being merged.
 *
 * The evals run on a developer's machine through their own Claude Code, so CI
 * needs no model key. Each run records its results in evals/receipt.json under
 * a digest of everything that decides what Forge does and how it is graded
 * (DIGEST_PATHS). CI recomputes the digest and fails when the receipt is for
 * other files, or when a sample is missing or did not pass.
 *
 *   tsx evals/src/receipt.ts check     CI: is the receipt current and green?
 *   tsx evals/src/receipt.ts digest    print the digest of the working tree
 *
 * A receipt is a record the developer commits, not a signature: it keeps
 * honest people from merging untested instructions, nothing more.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** What Forge does (skills, references, hooks) and how it is graded (the samples and their checker). */
export const DIGEST_PATHS = ['skills', 'references', 'hooks', 'evals/projects', 'evals/src']
export const RECEIPT = 'evals/receipt.json'
const SKIP = new Set(['.cache', 'node_modules', '.DS_Store'])

export interface SampleResult { passed: boolean; ranAt: string; costUsd?: number }
export interface Receipt {
  digest: string
  claude: string | null
  model: string | null
  samples: Record<string, SampleResult>
}

async function files(root: string, rel: string): Promise<string[]> {
  const out: string[] = []
  let entries
  try { entries = await readdir(join(root, rel), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...await files(root, p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

/**
 * sha256 over each file's path and content, sorted by path, with CRLF read as
 * LF so a Windows checkout and CI agree.
 */
export async function digest(root: string): Promise<string> {
  const all = (await Promise.all(DIGEST_PATHS.map(p => files(root, p)))).flat().sort()
  const h = createHash('sha256')
  for (const f of all) {
    const body = (await readFile(join(root, f), 'utf8')).replace(/\r\n/g, '\n')
    h.update(`${f}\0${createHash('sha256').update(body).digest('hex')}\n`)
  }
  return h.digest('hex')
}

export async function readReceipt(root: string): Promise<Receipt | null> {
  try { return JSON.parse(await readFile(join(root, RECEIPT), 'utf8')) as Receipt } catch { return null }
}

/**
 * Adds one run's results. Results recorded under another digest are dropped:
 * they describe other instructions. Samples run in separate batches against
 * the same files add up to one receipt.
 */
export async function record(
  root: string, results: Record<string, SampleResult>, meta: { claude: string | null; model: string | null },
): Promise<Receipt> {
  const d = await digest(root)
  const old = await readReceipt(root)
  const keep = old && old.digest === d && old.model === meta.model ? old.samples : {}
  const receipt: Receipt = { digest: d, ...meta, samples: { ...keep, ...results } }
  receipt.samples = Object.fromEntries(Object.entries(receipt.samples).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(join(root, RECEIPT), JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

/** Problems with the committed receipt; empty when every sample passed against these exact files. */
export async function check(root: string): Promise<string[]> {
  const problems: string[] = []
  const r = await readReceipt(root)
  const samples = (await readdir(join(root, 'evals', 'projects'), { withFileTypes: true }))
    .filter(e => e.isDirectory()).map(e => e.name).sort()
  if (!r) return [`${RECEIPT} is missing: run \`npm run eval\` and commit it`]
  const d = await digest(root)
  if (r.digest !== d) {
    problems.push(`${RECEIPT} is for other files: skills/, references/, hooks/ or the eval samples changed since the evals ran. Run \`npm run eval\` and commit the new receipt.`)
    return problems
  }
  for (const s of samples) {
    const res = r.samples[s]
    if (!res) problems.push(`${s}: not run against these files`)
    else if (!res.passed) problems.push(`${s}: failed`)
  }
  for (const s of Object.keys(r.samples)) if (!samples.includes(s)) problems.push(`${s}: no such sample (remove it from the receipt by running the evals again)`)
  return problems
}

async function main(argv: string[]): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  if (argv[0] === 'digest') { console.log(await digest(root)); return 0 }
  if (argv[0] === 'check') {
    const problems = await check(root)
    if (!problems.length) {
      const r = (await readReceipt(root))!
      console.log(`eval receipt is current: ${Object.keys(r.samples).length} samples passed against these files` +
        `${r.claude ? ` (Claude Code ${r.claude}` : ''}${r.model ? `, ${r.model}` : ''}${r.claude ? ')' : ''}`)
      return 0
    }
    console.log('The eval receipt does not cover this change:\n' + problems.map(p => `  - ${p}`).join('\n') +
      '\n\nRun the evals locally (`npm run eval`, or the run-evals skill in Claude Code) and commit evals/receipt.json.')
    return 1
  }
  console.log('usage: receipt.ts check | digest')
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(c => { process.exitCode = c })
}
