/**
 * Reports eval plugin pins that are behind upstream, so a new release of a skill
 * Forge works with (Archify, the design skills) is tested on purpose instead of
 * discovered by a user.
 *
 *   tsx src/pin-check.ts [--root .]
 *
 * Reads every `harness.plugins` pin in evals/projects/<sample>/expect.json and
 * compares it with upstream: the newest release tag for `track: "tags"`, the
 * default branch's head otherwise. Prints a Markdown report and exits 1 when a
 * pin is behind, 2 when upstream could not be read. Projects always use the
 * version the user installed; only the evals are pinned.
 */
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginPin } from '../evals/src/check.js'

export interface PinUse { pin: PluginPin; samples: string[] }

export interface PinStatus {
  name: string
  repo: string
  track: 'tags' | 'branch'
  pinned: string
  /** the commit upstream points at, or null when it could not be read */
  latest: string | null
  /** the release tag `latest` is, for `track: "tags"` */
  tag?: string
  samples: string[]
  behind: boolean
  error?: string
}

/** `git ls-remote [flags] <repo> [patterns]` output: one `<sha>\t<ref>` per line. */
export type LsRemote = (repo: string, flags: string[], patterns?: string[]) => string

const gitLsRemote: LsRemote = (repo, flags, patterns = []) =>
  execFileSync('git', ['ls-remote', ...flags, `https://github.com/${repo}.git`, ...patterns], { encoding: 'utf8', timeout: 60_000 })

/** Every pin the samples use, one entry per repo and commit, with the samples that use it. */
export async function collectPins(root: string): Promise<PinUse[]> {
  const projects = join(root, 'evals', 'projects')
  const uses = new Map<string, PinUse>()
  for (const d of (await readdir(projects, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    let exp: { harness?: { plugins?: PluginPin[] } }
    try { exp = JSON.parse(await readFile(join(projects, d, 'expect.json'), 'utf8')) } catch { continue }
    for (const pin of exp.harness?.plugins ?? []) {
      const key = `${pin.repo}@${pin.ref}`
      const use = uses.get(key) ?? { pin, samples: [] }
      use.samples.push(d)
      uses.set(key, use)
    }
  }
  return [...uses.values()]
}

const RELEASE = /^v?\d+(\.\d+)*$/

/** The newest release tag and its commit: the peeled `^{}` line for an annotated tag. */
export function newestTag(lsRemoteTags: string): { tag: string; sha: string } | null {
  const shas = new Map<string, string>()
  const order: string[] = []
  for (const line of lsRemoteTags.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/)
    if (!sha || !ref?.startsWith('refs/tags/')) continue
    const peeled = ref.endsWith('^{}')
    const tag = ref.slice('refs/tags/'.length).replace(/\^\{\}$/, '')
    if (!RELEASE.test(tag)) continue
    if (!shas.has(tag)) order.push(tag)
    if (peeled || !shas.has(tag)) shas.set(tag, sha)
  }
  const parts = (t: string) => t.replace(/^v/, '').split('.').map(Number)
  order.sort((a, b) => {
    const x = parts(a), y = parts(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0)
    return 0
  })
  return order.length ? { tag: order[0], sha: shas.get(order[0])! } : null
}

export function checkPin(use: PinUse, lsRemote: LsRemote = gitLsRemote): PinStatus {
  const { pin, samples } = use
  const track = pin.track ?? 'branch'
  const base = { name: pin.name, repo: pin.repo, track, pinned: pin.ref, samples }
  try {
    if (track === 'tags') {
      const newest = newestTag(lsRemote(pin.repo, ['--tags']))
      if (!newest) return { ...base, latest: null, behind: false, error: 'no release tags upstream' }
      return { ...base, latest: newest.sha, tag: newest.tag, behind: newest.sha !== pin.ref }
    }
    const head = lsRemote(pin.repo, [], ['HEAD']).trim().split(/\s+/)[0]
    if (!/^[0-9a-f]{40}$/.test(head ?? '')) return { ...base, latest: null, behind: false, error: 'could not read the default branch' }
    return { ...base, latest: head, behind: head !== pin.ref }
  } catch (e) {
    return { ...base, latest: null, behind: false, error: (e as Error).message.split('\n')[0] }
  }
}

export function report(statuses: PinStatus[]): string {
  const short = (s: string | null) => (s ? `\`${s.slice(0, 12)}\`` : '—')
  const rows = statuses.map(s => {
    const latest = s.error ? `⚠️ ${s.error}` : `${s.tag ? `${s.tag} ` : ''}${short(s.latest)}`
    const state = s.error ? 'unknown' : s.behind ? '**behind**' : 'current'
    return `| ${s.name} (\`${s.repo}\`) | ${s.track === 'tags' ? 'newest release' : 'default branch'} | ${short(s.pinned)} | ${latest} | ${state} | ${s.samples.join(', ')} |`
  })
  const behind = statuses.filter(s => s.behind)
  const lines = [
    '| Skill | Tracks | Pinned | Upstream | State | Samples |',
    '|---|---|---|---|---|---|',
    ...rows,
  ]
  if (behind.length) {
    lines.push('', 'To move a pin: set `ref` in each sample\'s `expect.json` to the upstream commit above, run those samples (`npm run eval -- <samples>`), and commit the new `evals/receipt.json` in a PR. If a sample fails, the new version changed something Forge relies on: fix Forge or keep the old pin, and say which in the PR.')
  }
  lines.push('', 'Projects always use the version the user installed; only the evals are pinned.')
  return lines.join('\n')
}

async function main(argv: string[]): Promise<number> {
  const at = argv.indexOf('--root')
  const root = resolve(at >= 0 ? argv[at + 1] : '.')
  const statuses = (await collectPins(root)).map(u => checkPin(u))
  console.log(report(statuses))
  if (statuses.some(s => s.behind)) return 1
  if (statuses.some(s => s.error)) return 2
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e); process.exit(2) })
}
