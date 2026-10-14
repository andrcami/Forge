import { execFile } from 'node:child_process'
import { access, mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { promisify } from 'node:util'
import { simpleGit } from 'simple-git'
import { LocalStore } from './store/local.js'
import { parseLesson } from './lesson.js'
import type { StoreConfig } from './store/types.js'

const run = promisify(execFile)
const exists = (p: string) => access(p).then(() => true, () => false)

export interface InitOptions {
  home: string
  /** `owner/name` on GitHub, or any git URL. Omit with `local`. */
  repo?: string
  /** Where the clone lives (git), or the lesson directory (local). */
  path: string
  local?: boolean
  /** Create the GitHub repo, private, when it does not exist. Needs `gh`. */
  create?: boolean
  /** A directory of lesson files to bring into the library. */
  importFrom?: string
  /** Replace an existing, different config (the old one is kept as config.json.bak). */
  force?: boolean
  /** Write the config to this project's .forge.json instead of the machine config. */
  projectDir?: string
  log: (s: string) => void
}

const SLUG = /^[\w.-]+\/[\w.-]+$/

const README = `# Forge lessons

The portable lesson library for Forge. **Keep this repository private:** lessons
are real findings from working codebases.

Lessons live in \`lessons/\`, one Markdown file each. Don't edit them by hand:
Forge reads and writes them through \`bin/forge lessons …\`, which pulls first,
validates, merges a second sighting into \`confirmed\`, commits only
\`lessons/\`, and pushes.
`

/**
 * The GitHub CLI's executable. On Windows, name the .exe: execFile does not apply
 * PATHEXT the way a shell does, and a stray extension-less `gh` file earlier on
 * PATH (seen in C:\Windows\System32) would otherwise shadow the real CLI.
 */
export function ghCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'gh.exe' : 'gh'
}

async function gh(args: string[]): Promise<string | null> {
  try { return (await run(ghCommand(), args)).stdout.trim() } catch { return null }
}

/** Resolves a slug to a clone URL, creating the repo (private) if asked. */
async function resolveRemote(repo: string, create: boolean, log: (s: string) => void): Promise<string> {
  if (!SLUG.test(repo)) {
    try { await run('git', ['ls-remote', repo]) } catch {
      throw new Error(`cannot reach ${repo} — check the URL and your git credentials`)
    }
    return repo
  }

  const hasGh = (await gh(['--version'])) !== null
  if (!hasGh) {
    const url = `git@github.com:${repo}.git`
    try { await run('git', ['ls-remote', url]); return url } catch {
      throw new Error(create
        ? `${repo} does not exist or is unreachable, and creating it needs the GitHub CLI (gh), which is not installed. ` +
          `Create it as a private, empty repo at https://github.com/new, then run this again.`
        : `cannot reach ${url} — create it as a private, empty repo at https://github.com/new, or check your SSH key`)
    }
  }

  const view = () => gh(['repo', 'view', repo, '--json', 'url', '--jq', '.url'])
  let url = await view()
  if (url === null) {
    if (!create) throw new Error(`${repo} does not exist (or gh cannot see it) — rerun with --create to create it as a private repo`)
    const made = await gh(['repo', 'create', repo, '--private', '--description', 'Forge lesson library (private)'])
    if (made === null) throw new Error(`gh could not create ${repo} — run \`gh auth status\` and check you may create repos there`)
    log(`created ${repo} (private)`)
    url = await view()
    if (url === null) throw new Error(`created ${repo} but gh cannot read it back`)
  }
  return url.endsWith('.git') || !/^https?:/.test(url) ? url : `${url}.git`
}

async function importLessons(from: string, lessonsDir: string): Promise<number> {
  const store = new LocalStore(lessonsDir)
  let n = 0
  for (const name of (await readdir(from)).filter(f => f.endsWith('.md'))) {
    const lesson = parseLesson(await readFile(join(from, name), 'utf8'))
    if (lesson.scope !== 'portable') continue
    await store.write(lesson)
    n++
  }
  return n
}

/** A path inside home as `~/…`, so a committed .forge.json works on every machine. */
function portable(path: string, home: string): string {
  const rel = relative(home, path)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? `~/${rel}` : path
}

async function writeConfig(home: string, store: StoreConfig, force: boolean, log: (s: string) => void, projectDir?: string): Promise<string> {
  const file = projectDir ? join(projectDir, '.forge.json') : join(home, '.claude', 'forge', 'config.json')
  if (projectDir) store = { ...store, path: portable(store.path, home) }
  const next = JSON.stringify({ store }, null, 2) + '\n'
  if (await exists(file)) {
    const current = await readFile(file, 'utf8')
    if (JSON.stringify(JSON.parse(current)) === JSON.stringify({ store })) return file
    if (!force) {
      throw new Error(`${file} already points somewhere else:\n${current.trim()}\nRerun with --force to replace it (the old one is kept as config.json.bak).`)
    }
    await copyFile(file, `${file}.bak`)
    log(`previous config kept at ${file}.bak`)
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, next)
  return file
}

/**
 * Sets up the lesson library on this machine: resolves (or creates) the repo,
 * clones it, seeds an empty one, optionally imports existing lessons, and
 * writes ~/.claude/forge/config.json.
 */
export async function initStore(o: InitOptions): Promise<StoreConfig> {
  if (o.local) {
    const store: StoreConfig = { backend: 'local', path: o.path }
    if (o.importFrom) o.log(`imported ${await importLessons(o.importFrom, o.path)} lessons`)
    o.log(`config written: ${await writeConfig(o.home, store, !!o.force, o.log, o.projectDir)}`)
    return store
  }
  if (!o.repo) throw new Error('store init needs --repo <owner/name|git-url>, or --local')

  const remote = await resolveRemote(o.repo, !!o.create, o.log)

  if (await exists(join(o.path, '.git'))) {
    const origin = (await simpleGit(o.path).getRemotes(true)).find(r => r.name === 'origin')?.refs.fetch
    if (origin !== remote) throw new Error(`${o.path} is already a clone of ${origin ?? 'nothing'}, not ${remote}`)
    o.log(`using existing clone at ${o.path}`)
  } else {
    if (await exists(o.path) && (await readdir(o.path)).length > 0) {
      throw new Error(`${o.path} exists and is not empty — choose another --path`)
    }
    await mkdir(dirname(o.path), { recursive: true })
    await simpleGit().clone(remote, o.path)
    o.log(`cloned ${remote} → ${o.path}`)
  }

  const git = simpleGit(o.path)
  // no commits anywhere: a freshly created repo (git exits silently non-zero on an unborn HEAD)
  const empty = (await git.raw(['rev-list', '-n', '1', '--all'])).trim() === ''
  if (empty) await git.raw(['checkout', '-q', '-B', 'main'])
  else await git.pull()

  const lessonsDir = join(o.path, 'lessons')
  const toCommit: string[] = []
  if (!(await exists(lessonsDir))) {
    await mkdir(lessonsDir, { recursive: true })
    await writeFile(join(lessonsDir, '.gitkeep'), '')
    toCommit.push('lessons')
  }
  if (empty && !(await exists(join(o.path, 'README.md')))) {
    await writeFile(join(o.path, 'README.md'), README)
    toCommit.push('README.md')
  }
  let imported = 0
  if (o.importFrom) {
    imported = await importLessons(o.importFrom, lessonsDir)
    if (imported) toCommit.push('lessons')
  }
  if (toCommit.length) {
    await git.add([...new Set(toCommit)])
    const staged = (await git.status()).staged.length
    if (staged) {
      await git.commit(imported ? `lessons: import ${imported} lessons` : 'lessons: initialise the library')
      await git.push('origin', empty ? 'HEAD:refs/heads/main' : 'HEAD')
      if (empty) await git.raw(['branch', '--set-upstream-to=origin/main']).catch(() => {})
      o.log(imported ? `imported ${imported} lessons, committed and pushed` : 'initialised the library, committed and pushed')
    }
  }

  const store: StoreConfig = { backend: 'git', path: o.path, remote, subdir: 'lessons' }
  o.log(`config written: ${await writeConfig(o.home, store, !!o.force, o.log, o.projectDir)}`)
  return store
}
