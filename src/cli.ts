/**
 * The Forge command line. Skills call this rather than editing lesson files and
 * running git themselves, so every write goes through the tested store: pull
 * first, validate, merge sightings, commit only the lesson directory, and treat
 * a failed push as an error.
 *
 *   forge lessons list [--tag <t>]… [--any-tag <t>]… [--status <s>]… [--json]
 *   forge lessons read <id> [--json]
 *   forge lessons check <file.md>
 *   forge lessons write <file.md>
 *   forge lessons retire <id> --reason "<why>"
 *   forge store info [--json]
 *   forge store init --repo <owner/name|git-url> --path <dir> [--create] [--import <dir>] [--force]
 *   forge store init --local [--path <dir>] [--import <dir>] [--force]
 *   forge store init --project [--repo … --path …]   (this project's .forge.json; clones what it names)
 *   forge chat-style [caveman|normal] [--level lite|full] [--json]
 *
 * Tags may end in `*` to match a namespace: `--any-tag 'stack:*'`.
 */
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { simpleGit } from 'simple-git'
import { resolveConfig, PROJECT_FILE } from './config.js'
import { parseLesson, serializeLesson, styleWarnings, type Lesson, type LessonStatus } from './lesson.js'
import { createStore } from './store/index.js'
import { initStore } from './setup.js'
import { chatStyleStatus, describe, setChatStyle, type ChatStyle, type Level } from './chatstyle.js'

export interface CliIO {
  home: string
  cwd: string
  out: (s: string) => void
  err: (s: string) => void
}

class UsageError extends Error {}

/** The project a .forge.json belongs in: the git work tree containing cwd, else cwd. */
async function projectRoot(cwd: string): Promise<string> {
  try { return (await simpleGit(cwd).revparse(['--show-toplevel'])).trim() || cwd } catch { return cwd }
}

const USAGE = `usage:
  forge lessons list [--tag <t>]... [--any-tag <t>]... [--status <s>]... [--json]
  forge lessons read <id> [--json]
  forge lessons check <file.md>
  forge lessons write <file.md>
  forge lessons retire <id> --reason "<why>"
  forge store info [--json]
  forge store init --repo <owner/name|git-url> --path <dir> [--create] [--import <dir>] [--force]
  forge store init --local [--path <dir>] [--import <dir>] [--force]
  forge store init --project [--repo <owner/name|git-url> --path <dir>] [--create] [--force]
  forge chat-style [caveman|normal] [--level lite|full] [--json]

--tag must all match; --any-tag needs one match; a trailing * matches a prefix.`

interface Args { positional: string[]; flags: Map<string, string[]>; bools: Set<string> }

function parseArgs(argv: string[]): Args {
  const valued = new Set(['--tag', '--any-tag', '--status', '--reason', '--repo', '--path', '--import', '--level'])
  const out: Args = { positional: [], flags: new Map(), bools: new Set() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (valued.has(a)) {
      const v = argv[++i]
      if (v === undefined) throw new UsageError(`${a} needs a value`)
      out.flags.set(a, [...(out.flags.get(a) ?? []), v])
    } else if (a.startsWith('--')) out.bools.add(a)
    else out.positional.push(a)
  }
  return out
}

function tagMatches(pattern: string, tag: string): boolean {
  return pattern.endsWith('*') ? tag.startsWith(pattern.slice(0, -1)) : tag === pattern
}

export function filterLessons(lessons: Lesson[], all: string[], any: string[], statuses: string[]): Lesson[] {
  return lessons.filter(l =>
    all.every(p => l.tags.some(t => tagMatches(p, t))) &&
    (any.length === 0 || any.some(p => l.tags.some(t => tagMatches(p, t)))) &&
    (statuses.length === 0 || statuses.includes(l.status)))
}

const STATUS_ORDER: Record<LessonStatus, number> = { confirmed: 0, observed: 1, retired: 2 }

function summary(l: Lesson): string {
  const first = l.body.split('\n').find(s => s.trim()) ?? ''
  const extra = l.status === 'retired' ? `\n    retired: ${l.retired_reason}` : ''
  return `${l.status.padEnd(9)} ${l.id}  [${l.tags.join(', ')}]\n    ${first}${extra}`
}

export async function main(argv: string[], io: CliIO): Promise<number> {
  try {
    // `chat-style` takes its choice where other groups take a subcommand
    if (argv[0] === 'chat-style') {
      const args = parseArgs(argv.slice(1))
      const style = args.positional[0]
      const level = args.flags.get('--level')?.[0]
      if (style && style !== 'caveman' && style !== 'normal') throw new UsageError(`chat-style is caveman or normal, not ${style}`)
      if (level && level !== 'lite' && level !== 'full') throw new UsageError(`--level is lite or full, not ${level}`)
      if (level && style !== 'caveman') throw new UsageError('--level goes with chat-style caveman')
      if (style) for (const line of await setChatStyle(io.home, style as ChatStyle, level as Level | undefined)) io.out(line)
      const status = await chatStyleStatus(io.home)
      io.out(args.bools.has('--json') ? JSON.stringify(status, null, 2) : describe(status).join('\n'))
      return 0
    }

    const [group, cmd, ...rest] = argv
    const args = parseArgs(rest)
    const json = args.bools.has('--json')
    const one = (f: string) => args.flags.get(f)?.[0]
    const expand = (p: string) => resolve(io.cwd, p.replace(/^~(?=$|\/)/, io.home))

    // before loadConfig: init is what creates the config
    if (group === 'store' && cmd === 'init') {
      const local = args.bools.has('--local')
      const projectDir = args.bools.has('--project') ? await projectRoot(io.cwd) : undefined
      let repo = one('--repo')
      let path = one('--path') ?? (local ? join(io.home, '.claude', 'forge', 'lessons') : undefined)
      // --project with nothing else: clone what the committed .forge.json names
      if (projectDir && !repo && !local) {
        const named = await resolveConfig(io.home, projectDir)
        if (named.source.kind !== 'project' || named.store.backend !== 'git' || !named.store.remote) {
          throw new UsageError(`no git library is named in ${join(projectDir, PROJECT_FILE)} — pass --repo and --path`)
        }
        repo = named.store.remote
        path = named.store.path
      }
      if (!path) throw new UsageError('store init needs --path <dir> for the clone')
      if (!local && !repo) throw new UsageError('store init needs --repo <owner/name|git-url>, or --local')
      await initStore({
        home: io.home, repo, path: expand(path), local, projectDir,
        create: args.bools.has('--create'), force: args.bools.has('--force'),
        importFrom: one('--import') ? expand(one('--import')!) : undefined, log: io.out,
      })
      return main(['store', 'info'], io)
    }

    // a lint: needs no library
    if (group === 'lessons' && cmd === 'check') {
      const file = args.positional[0]
      if (!file) throw new UsageError('lessons check needs a lesson file')
      const lesson = parseLesson(await readFile(resolve(io.cwd, file), 'utf8'))
      const warnings = styleWarnings(lesson.body)
      for (const w of warnings) io.err(`style: ${w}`)
      io.out(warnings.length ? `${lesson.id}: valid, ${warnings.length} style warning(s)` : `${lesson.id}: valid`)
      return 0
    }

    const config = await resolveConfig(io.home, io.cwd)
    const from = config.source.file ?? 'the default (no config file)'
    const cloned = config.store.backend !== 'git' || await stat(config.store.path).then(() => true, () => false)
    if (!cloned && !(group === 'store' && cmd === 'info')) {
      throw new Error(`the lesson library ${from} names is not cloned at ${config.store.path} — run /forge:setup` +
        (config.source.kind === 'project' ? ' (or: forge store init --project)' : ''))
    }
    const store = createStore(config.store)

    if (group === 'lessons' && cmd === 'list') {
      const lessons = filterLessons(await store.list(), args.flags.get('--tag') ?? [],
        args.flags.get('--any-tag') ?? [], args.flags.get('--status') ?? [])
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id.localeCompare(b.id))
      if (json) io.out(JSON.stringify(lessons, null, 2))
      else io.out(lessons.length ? lessons.map(summary).join('\n') : 'no matching lessons')
      return 0
    }

    if (group === 'lessons' && cmd === 'read') {
      const id = args.positional[0]
      if (!id) throw new UsageError('lessons read needs an id')
      const lesson = await store.read(id)
      if (!lesson) { io.err(`lesson not found: ${id}`); return 1 }
      io.out(json ? JSON.stringify(lesson, null, 2) : serializeLesson(lesson))
      return 0
    }

    if (group === 'lessons' && cmd === 'write') {
      const file = args.positional[0]
      if (!file) throw new UsageError('lessons write needs a lesson file')
      const lesson = parseLesson(await readFile(resolve(io.cwd, file), 'utf8'))
      for (const w of styleWarnings(lesson.body)) io.err(`style: ${w}`)
      const before = await store.read(lesson.id)
      await store.write(lesson)
      const after = await store.read(lesson.id)
      const outcome = !before ? `added ${lesson.id} as ${after?.status}`
        : before.status !== after?.status ? `promoted ${lesson.id}: ${before.status} → ${after?.status}`
        : `updated ${lesson.id} (${after?.status}, ${after?.evidence.length} evidence)`
      io.out(`${outcome}${config.store.backend === 'git' && config.store.remote ? ' — committed and pushed' : ''}`)
      return 0
    }

    if (group === 'lessons' && cmd === 'retire') {
      const id = args.positional[0]
      const reason = args.flags.get('--reason')?.[0]
      if (!id || !reason) throw new UsageError('lessons retire needs an id and --reason')
      await store.retire(id, reason)
      io.out(`retired ${id}`)
      return 0
    }

    if (group === 'store' && cmd === 'info') {
      const s = config.store
      const lessonsDir = s.backend === 'git' ? join(s.path, s.subdir ?? 'lessons') : s.path
      const exists = await stat(lessonsDir).then(st => st.isDirectory(), () => false)
      let remoteUrl: string | null = null
      let isRepo = false
      if (s.backend === 'git') {
        try {
          isRepo = await simpleGit(s.path).checkIsRepo()
          if (isRepo) remoteUrl = (await simpleGit(s.path).getRemotes(true)).find(r => r.name === 'origin')?.refs.push ?? null
        } catch { /* reported as not a repo */ }
      }
      const count = exists && cloned ? (await store.list()).length : 0
      const problems: string[] = []
      if (s.backend === 'git' && !isRepo) {
        problems.push(cloned ? `${s.path} is not a git repository`
          : `not cloned on this machine yet — run: forge store init${config.source.kind === 'project' ? ' --project' : ' --repo <repo> --path ' + s.path}`)
      }
      if (s.backend === 'git' && s.remote && remoteUrl && remoteUrl !== s.remote) {
        problems.push(`origin is ${remoteUrl}, but the config names ${s.remote}`)
      }
      if (!exists) problems.push(`lessons directory ${lessonsDir} does not exist yet (created on first write)`)
      const info = { source: config.source, backend: s.backend, path: s.path, subdir: s.subdir ?? null, remote: s.remote ?? null,
        origin: remoteUrl, lessonsDir, lessons: count, problems }
      if (json) io.out(JSON.stringify(info, null, 2))
      else io.out([
        `config:   ${config.source.kind === 'project' ? `project — ${config.source.file}` : config.source.kind === 'machine' ? `machine — ${config.source.file}` : 'default (no config file; run /forge:setup)'}`,
        `backend:  ${s.backend}`,
        `lessons:  ${lessonsDir} (${count})`,
        ...(s.backend === 'git' ? [`remote:   ${s.remote ?? '(none — local commits only)'}`] : []),
        ...problems.map(p => `problem:  ${p}`),
      ].join('\n'))
      return 0
    }

    throw new UsageError(argv.length ? `unknown command: ${argv.slice(0, 2).join(' ')}` : 'no command')
  } catch (e) {
    io.err(e instanceof UsageError ? `${e.message}\n\n${USAGE}` : `forge: ${(e as Error).message}`)
    return e instanceof UsageError ? 2 : 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2), {
    home: homedir(), cwd: process.cwd(),
    out: s => process.stdout.write(s + '\n'), err: s => process.stderr.write(s + '\n'),
  }).then(code => process.exit(code))
}
