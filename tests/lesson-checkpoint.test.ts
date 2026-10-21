import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — a plain .mjs hook, no type declarations
import { gitAction } from '../hooks/lesson-checkpoint.mjs'

const hook = join(__dirname, '..', 'hooks', 'lesson-checkpoint.mjs')
let root: string, home: string

const fire = (input: Record<string, unknown>) => new Promise<string>((res, rej) => {
  const child = execFile('node', [hook], { env: { ...process.env, HOME: home } },
    (e, stdout) => e ? rej(e) : res(stdout))
  child.stdin!.end(JSON.stringify({ session_id: 's1', cwd: root, ...input }))
})
const stop = (input: Record<string, unknown> = {}) =>
  fire({ hook_event_name: 'Stop', stop_hook_active: false, ...input })
const bash = (command: string) =>
  fire({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
const reason = (out: string) => JSON.parse(out).hookSpecificOutput

async function configure(checkpoints?: unknown) {
  await mkdir(join(home, '.claude/forge'), { recursive: true })
  await writeFile(join(home, '.claude/forge/config.json'), JSON.stringify({
    store: { backend: 'local', path: '/x' },
    ...(checkpoints === undefined ? {} : { lessonCheckpoints: checkpoints }),
  }))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-checkpoint-'))
  home = join(root, 'home')
  await mkdir(home, { recursive: true })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('lesson checkpoint — turns', () => {
  it('is silent when no library is configured', async () => {
    for (let i = 0; i < 6; i++) expect(await stop()).toBe('')
    expect(await bash('git commit -m x')).toBe('')
    expect(await fire({ hook_event_name: 'SessionStart', source: 'compact' })).toBe('')
  })

  it('asks for lessons every fifth turn by default, and only proposes', async () => {
    await configure()
    for (let i = 0; i < 4; i++) expect(await stop()).toBe('')
    const said = JSON.parse(await stop())
    expect(said.decision).toBe('block')
    expect(said.reason).toMatch(/every 5 turns/)
    expect(said.reason).toMatch(/ask before writing anything/)
    expect(said.reason).toMatch(/If nothing qualifies, stop without mentioning/)
    expect(await stop()).toBe('')
  })

  it('never blocks a stop it already caused', async () => {
    await configure({ every: 1 })
    expect(await stop({ stop_hook_active: true })).toBe('')
    expect(await stop()).toMatch(/every turn\)/)
  })

  it('counts each session separately', async () => {
    await configure({ every: 2 })
    expect(await stop({ session_id: 'a' })).toBe('')
    expect(await stop({ session_id: 'b' })).toBe('')
    expect(await stop({ session_id: 'a' })).toMatch(/"block"/)
  })

  it('can be turned off: every: 0 for turns, false for everything', async () => {
    await configure({ every: 0 })
    for (let i = 0; i < 6; i++) expect(await stop()).toBe('')
    expect(await bash('git commit -m x')).not.toBe('')
    await configure(false)
    expect(await bash('git commit -m y')).toBe('')
  })

  it('honours a project .forge.json', async () => {
    const project = join(home, 'clinic')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, '.forge.json'), JSON.stringify({
      store: { backend: 'git', path: '~/work-clone', remote: 'x' }, lessonCheckpoints: { every: 1 },
    }))
    expect(await stop({ cwd: project })).toMatch(/every turn\)/)
  })
})

describe('lesson checkpoint — commits and pull requests', () => {
  it('holds a commit once, then lets the retry through', async () => {
    await configure()
    const held = reason(await bash('git add -A && git commit -m "x"'))
    expect(held.permissionDecision).toBe('deny')
    expect(held.permissionDecisionReason).toMatch(/held once, on purpose/)
    expect(held.permissionDecisionReason).toMatch(/run the same commit again/)
    expect(await bash('git add -A && git commit -m "x"')).toBe('')
    // the next commit is a new one
    expect(await bash('git commit -m "y"')).toMatch(/deny/)
  })

  it('holds PR creation once, by gh or by the GitHub tool, and lets the harvest commit through', async () => {
    await configure()
    expect(reason(await bash('gh pr create --fill')).permissionDecisionReason).toMatch(/follow the harvest skill/)
    expect(await bash('git commit -m "lessons"')).toBe('')
    expect(await bash('gh pr create --fill')).toBe('')
    const mcp = await fire({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__create_pull_request', tool_input: {} })
    expect(reason(mcp).permissionDecision).toBe('deny')
  })

  it('a commit or PR checkpoint restarts the turn count', async () => {
    await configure({ every: 2 })
    expect(await stop()).toBe('')
    await bash('git commit -m x')
    expect(await stop()).toBe('')
    expect(await stop()).toMatch(/"block"/)
  })

  it('each can be turned off', async () => {
    await configure({ commit: false, pr: false })
    expect(await bash('git commit -m x')).toBe('')
    expect(await bash('gh pr create')).toBe('')
  })

  it('recognises commits and PRs, and nothing else', () => {
    expect(gitAction('Bash', { command: 'git commit -m x' })).toBe('commit')
    expect(gitAction('Bash', { command: 'cd a && git -C repo commit -am x' })).toBe('commit')
    expect(gitAction('Bash', { command: 'git -c user.name=x commit' })).toBe('commit')
    expect(gitAction('Bash', { command: 'gh pr create --title t' })).toBe('pr')
    expect(gitAction('mcp__github__create_pull_request', {})).toBe('pr')
    for (const command of ['git status', 'git log --grep commit', 'git commit-tree abc', 'npm test', 'gh pr view'])
      expect(gitAction('Bash', { command })).toBeNull()
    expect(gitAction('Edit', { command: 'git commit' })).toBeNull()
  })
})

describe('lesson checkpoint — compaction', () => {
  it('after a compaction, asks Claude to read the summary for lessons', async () => {
    await configure()
    const said = await fire({ hook_event_name: 'SessionStart', source: 'compact' })
    expect(said).toMatch(/just compacted/)
    expect(said).toMatch(/next natural stopping point/)
    expect(await fire({ hook_event_name: 'SessionStart', source: 'startup' })).toBe('')
  })

  it('can be turned off', async () => {
    await configure({ compact: false })
    expect(await fire({ hook_event_name: 'SessionStart', source: 'compact' })).toBe('')
  })
})

describe('hook registration', () => {
  it('registers the checkpoint for Stop, commits and PRs, and compaction', async () => {
    const { hooks } = JSON.parse(await readFile(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'))
    for (const event of ['Stop', 'PreToolUse']) expect(JSON.stringify(hooks[event])).toMatch(/lesson-checkpoint\.mjs/)
    const compact = hooks.SessionStart.find((h: { matcher?: string }) => h.matcher === 'compact')
    expect(JSON.stringify(compact)).toMatch(/lesson-checkpoint\.mjs/)
    const re = new RegExp(hooks.PreToolUse[0].matcher)
    expect(['Bash', 'mcp__github__create_pull_request'].every(t => re.test(t))).toBe(true)
    expect(['BashOutput', 'Edit', 'mcp__github__create_issue'].some(t => re.test(t))).toBe(false)
  })
})
