/**
 * Framework QA: run Forge's phases against the sample projects and check the result.
 *
 *   npm run eval -- [project…] [--yolo] [--no-verify] [--model <id>]
 *   npm run eval:check -- <workspace> <project>
 *
 * A harvest sample instead starts from a git repo the runner builds: seed/ on
 * main, branch/ laid over it on a feature branch. /forge:harvest then runs on it.
 *
 * Each sample runs in a fresh temp workspace. The simulated user's answers
 * (brief.md) are copied in; the expectations (expect.json) never are, so the
 * phases cannot read what they are graded against.
 */
import { spawn, execFileSync } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkProject, isHarvest, validateExpectation,
  type Expectation, type Finding, type HarvestExpectation, type PhaseExpectation, type PluginPin, type VerifyStep,
} from './check.js'

const FORGE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECTS = join(FORGE, 'evals', 'projects')
const PLUGIN_CACHE = join(FORGE, 'evals', '.cache', 'plugins')
const VERIFY_TIMEOUT_MS = 15 * 60 * 1000

const HARNESS_PROMPT = `FORGE EVAL MODE. You are running one Forge phase non-interactively, as part of
an automated test of the Forge plugin itself.

- A simulated user's answers are in docs/eval/brief.md. Whenever the skill tells
  you to ask the user something, take the answer from that file instead of
  asking. If the brief does not cover it, choose the most conservative reasonable
  answer and append the question and your assumption to docs/eval/assumptions.md.
- Whenever the skill tells you to ask for approval, treat the brief's
  "Approvals" section as the user's reply. If it does not mention this phase,
  the user approves.
- Follow the skill exactly otherwise — including refusing to run when its gate
  says so, and raising an escalation when its triggers fire. A refusal is a
  correct outcome, not a failure; state it and stop.
- At the build phase's terminal handoff, state which planning path you would
  take, and stop. Do not write an implementation plan.
- Install nothing globally. Keep every file inside this directory.`

/** What build needs to scaffold and prove a harness for the stacks the samples choose. */
const SCAFFOLD_TOOLS = [
  'git', 'npm', 'npx', 'node', 'pnpm', 'python3', 'python', 'pip', 'uv', 'pytest',
  'go', 'cargo', 'mix', 'mkdir', 'ls', 'cat', 'touch', 'chmod',
].map(c => `Bash(${c}:*)`)

const PHASE_PROMPT: Record<string, string> = {
  scope: '/forge:scope — run this phase for the project in this directory.',
  architect: '/forge:architect — run this phase for the project in this directory.',
  design: '/forge:design — run this phase for the project in this directory.',
  build: '/forge:build — run this phase for the project in this directory.',
  harvest: '/forge:harvest — the current branch is finished and its PR is about to open; harvest it against main.',
}

/** Harvest reads and writes the library through the plugin's CLI, by name or by path. */
const FORGE_CLI = ['Bash(forge:*)', `Bash(${join(FORGE, 'bin', 'forge')}:*)`]

async function loadProject(name: string): Promise<{ brief: string; exp: Expectation }> {
  const dir = join(PROJECTS, name)
  const exp = JSON.parse(await readFile(join(dir, 'expect.json'), 'utf8'))
  const errs = validateExpectation(exp)
  if (errs.length) throw new Error(`${name}/expect.json: ${errs.join('; ')}`)
  return { brief: await readFile(join(dir, 'brief.md'), 'utf8'), exp }
}

/**
 * Clones an external plugin at its pinned commit, once. A repo with skills but no
 * plugin manifest (installed with `npx skills add` in real use) gets a minimal one,
 * so `--plugin-dir` can load it.
 */
async function ensurePlugin(pin: PluginPin): Promise<string> {
  const dir = join(PLUGIN_CACHE, `${pin.name}@${pin.ref.slice(0, 12)}`)
  const ready = await access(join(dir, '.git')).then(() => true, () => false)
  if (!ready) {
    await mkdir(dir, { recursive: true })
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
    git('init', '-q')
    git('remote', 'add', 'origin', `https://github.com/${pin.repo}.git`)
    git('fetch', '-q', '--depth', '1', 'origin', pin.ref)
    git('checkout', '-q', 'FETCH_HEAD')
  }
  const manifest = join(dir, '.claude-plugin', 'plugin.json')
  if (!(await access(manifest).then(() => true, () => false))) {
    await mkdir(dirname(manifest), { recursive: true })
    await writeFile(manifest, JSON.stringify({ name: pin.name, version: '0.0.0-eval' }, null, 2))
  }
  return dir
}

function runPhase(cwd: string, phase: string, opts: { yolo: boolean; model?: string; plugins: string[] }): Promise<number> {
  const args = [
    '-p', PHASE_PROMPT[phase],
    '--plugin-dir', FORGE,
    ...opts.plugins.flatMap(p => ['--plugin-dir', p]),
    '--add-dir', FORGE, // the skills read the plugin's references/; real installs can read the plugin cache
    '--append-system-prompt', HARNESS_PROMPT,
    '--output-format', 'json',
  ]
  if (opts.yolo) args.push('--permission-mode', 'bypassPermissions')
  else args.push('--permission-mode', 'acceptEdits', '--allowedTools',
    ...SCAFFOLD_TOOLS, ...FORGE_CLI)
  if (opts.model) args.push('--model', opts.model)

  return new Promise((res, rej) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', d => { stdout += d })
    child.on('error', rej)
    child.on('close', async code => {
      await writeFile(join(cwd, 'docs', 'eval', `transcript-${phase}.json`), stdout)
      res(code ?? 1)
    })
  })
}

function sh(cwd: string, command: string): Promise<VerifyStep> {
  return new Promise(res => {
    const child = spawn('sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    const timer = setTimeout(() => child.kill('SIGKILL'), VERIFY_TIMEOUT_MS)
    child.on('close', code => {
      clearTimeout(timer)
      res({ command, code: code ?? 124, tail: out.split('\n').slice(-40).join('\n') })
    })
  })
}

/**
 * A browser to stand in for the one the generated project's Playwright pins, for
 * sandboxes that cannot download browsers. Locally Playwright downloads its own and
 * this stays unset.
 */
async function standInChromium(): Promise<string | null> {
  const candidates = [process.env.EVAL_CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean) as string[]
  for (const c of candidates) if (await access(c).then(() => true, () => false)) return c
  return null
}

const EVAL_PLAYWRIGHT_CONFIG = `import { resolve } from 'node:path'
import base from '../../playwright.config'
// Generated by the Forge eval runner: the project's own config, launched with a
// stand-in browser because this sandbox cannot download the pinned one.
const root = process.cwd()
const executablePath = process.env.EVAL_CHROMIUM
const launch = (u: any = {}) => ({ ...u, launchOptions: { ...u.launchOptions, executablePath } })
const server = (w: any) => w && ({ ...w, cwd: w.cwd ?? root })
export default {
  ...base,
  testDir: resolve(root, base.testDir ?? '.'),
  use: launch(base.use),
  projects: (base.projects ?? []).map((p: any) => ({ ...p, use: launch(p.use) })),
  webServer: Array.isArray(base.webServer) ? base.webServer.map(server) : server(base.webServer),
}
`

/**
 * Runs the generated project's own commands from docs/forge/commands.json and
 * records the result in docs/eval/verify.json for the checker. A harness that
 * build claims runs, but does not, is the failure this exists to catch.
 */
async function verifyBuild(cwd: string, exp: PhaseExpectation): Promise<void> {
  let commands: Record<string, string>
  try { commands = JSON.parse(await readFile(join(cwd, 'docs', 'forge', 'commands.json'), 'utf8')) } catch { return }
  const steps: Record<string, VerifyStep | 'skipped'> = {}
  for (const key of ['install', 'test', 'integration', 'e2e'] as const) {
    if (!commands[key]) continue
    if (key === 'integration') { steps.integration = 'skipped'; continue } // needs services the sandbox lacks
    if (key === 'e2e' && !exp.harness?.e2e) { steps.e2e = 'skipped'; continue }
    let command = commands[key]
    const chromium = key === 'e2e' ? await standInChromium() : null
    const nodePlaywright = await access(join(cwd, 'playwright.config.ts')).then(() => true, () => false)
    if (chromium && nodePlaywright && /playwright test/.test(command)) {
      await writeFile(join(cwd, 'docs', 'eval', 'playwright.eval.config.ts'), EVAL_PLAYWRIGHT_CONFIG)
      command = `EVAL_CHROMIUM=${chromium} ${command} -c docs/eval/playwright.eval.config.ts`
    }
    process.stdout.write(`  verify:${key}… `)
    steps[key] = await sh(cwd, command)
    const code = (steps[key] as VerifyStep).code
    console.log(code === 0 ? 'ok' : `exited ${code}`)
    if (code !== 0) break
  }
  await writeFile(join(cwd, 'docs', 'eval', 'verify.json'), JSON.stringify(steps, null, 2))
}

/**
 * Builds a harvest sample's repo: seed/ committed on main, then branch/ laid
 * over it and committed on the feature branch. Snapshots the files the sample
 * expects to stay unchanged, and keeps docs/eval out of git so the harvest
 * sees only the branch's own work.
 */
async function buildBranch(workspace: string, name: string, exp: HarvestExpectation): Promise<void> {
  const git = (...a: string[]) => execFileSync('git',
    ['-c', 'user.name=Forge Eval', '-c', 'user.email=eval@forge.invalid', '-c', 'commit.gpgsign=false', ...a],
    { cwd: workspace, stdio: 'ignore' })
  await cp(join(PROJECTS, exp.harness.seedFrom ?? name, 'seed'), workspace, { recursive: true })
  git('init', '-q', '--initial-branch=main')
  await writeFile(join(workspace, '.git', 'info', 'exclude'), 'docs/eval/\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Initial state')
  git('checkout', '-q', '-b', exp.harness.branch.name)
  await cp(join(PROJECTS, name, 'branch'), workspace, { recursive: true })
  git('add', '-A')
  git('commit', '-q', '-m', exp.harness.branch.message)

  const snapshot: Record<string, string | null> = {}
  for (const f of exp.expect.unchanged ?? []) snapshot[f] = await readFile(join(workspace, f), 'utf8').catch(() => null)
  await writeFile(join(workspace, 'docs', 'eval', 'snapshot.json'), JSON.stringify(snapshot, null, 2))
}

function report(name: string, exp: Expectation, findings: Finding[], workspace: string): boolean {
  const ok = findings.length === 0
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${name} — ${exp.description}`)
  for (const f of findings) console.log(`      [${f.check}] ${f.message}`)
  console.log(`      workspace: ${workspace}`)
  return ok
}

async function main() {
  const argv = process.argv.slice(2)

  if (argv[0] === 'check') {
    const [, workspace, name] = argv
    if (!workspace || !name) throw new Error('usage: eval:check <workspace> <project>')
    const { exp } = await loadProject(name)
    const ok = report(name, exp, await checkProject(resolve(workspace), exp, FORGE), resolve(workspace))
    process.exit(ok ? 0 : 1)
  }

  const flag = (f: string) => argv.includes(f)
  const modelAt = argv.indexOf('--model')
  const model = modelAt >= 0 ? argv[modelAt + 1] : undefined
  const named = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--model')
  const all = (await readdir(PROJECTS, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()
  const selected = named.length ? named : all
  for (const n of selected) if (!all.includes(n)) throw new Error(`unknown project ${n}; have: ${all.join(', ')}`)

  // validate every fixture before spending anything
  const loaded = await Promise.all(selected.map(async n => [n, await loadProject(n)] as const))

  let failed = 0
  for (const [name, { brief, exp }] of loaded) {
    const workspace = await mkdtemp(join(tmpdir(), `forge-eval-${name}-`))
    await mkdir(join(workspace, 'docs', 'eval'), { recursive: true })
    await writeFile(join(workspace, 'docs', 'eval', 'brief.md'), brief)
    const pins = isHarvest(exp) ? [] : exp.harness?.plugins ?? []
    if (isHarvest(exp)) await buildBranch(workspace, name, exp)
    else await cp(join(PROJECTS, name, 'seed'), workspace, { recursive: true }).catch(() => {})

    const plugins = await Promise.all(pins.map(ensurePlugin))
    console.log(`\n▶ ${name}: ${exp.phases.join(' → ')}${pins.length ? ` (with ${pins.map(p => p.name).join(', ')})` : ''}`)
    for (const phase of exp.phases) {
      process.stdout.write(`  ${phase}… `)
      const code = await runPhase(workspace, phase, { yolo: flag('--yolo'), model, plugins })
      console.log(code === 0 ? 'done' : `exited ${code}`)
    }
    if (!isHarvest(exp) && exp.phases.includes('build') && !flag('--no-verify')) await verifyBuild(workspace, exp)
    const ok = report(name, exp, await checkProject(workspace, exp, FORGE), workspace)
    if (!ok) failed++
  }

  console.log(`\n${loaded.length - failed}/${loaded.length} sample projects passed`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(2) })
