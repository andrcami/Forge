#!/usr/bin/env node
// Forge lesson checkpoints. One script for four moments:
//   Stop             every N turns, holds Claude back from stopping once
//   PreToolUse       holds the first `git commit` once, and the first PR creation once
//   SessionStart     after a compaction, asks Claude to read the summary for lessons
// Each asks Claude to look for lessons worth keeping and propose them. It never
// writes a lesson: the user still approves each one. Silent when no library is
// configured, when a checkpoint is turned off, or on any error.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULTS = { every: 5, commit: true, pr: true, compact: true }
const STALE_MS = 7 * 24 * 60 * 60 * 1000
// a held commit or PR goes through on retry; a retry this much later is a new one
const RETRY_MS = 30 * 60 * 1000

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }

/** The project's .forge.json (upward from cwd, stopping at home), else the machine config — as the CLI resolves it. */
function findConfig(home, cwd) {
  for (let dir = cwd; ;) {
    const project = readJson(join(dir, '.forge.json'))
    if (project) return project
    const parent = dirname(dir)
    if (dir === home || parent === dir) break
    dir = parent
  }
  return readJson(join(home, '.claude', 'forge', 'config.json'))
}

/** The checkpoint settings, or null when there is no library or checkpoints are off. */
export function settings(config) {
  if (!config?.store) return null
  const c = config.lessonCheckpoints
  if (c === false) return null
  const s = { ...DEFAULTS, ...(c && typeof c === 'object' ? c : {}) }
  if (!Number.isInteger(s.every) || s.every < 0) s.every = DEFAULTS.every
  return s
}

const REVIEW = 'Look for lessons worth keeping: corrections the user made, mistakes you made and then fixed, ' +
  'tool or provider behaviour that surprised you, and rules the user stated. Apply the harvest test to each: ' +
  'durable and general? which skill owns it? portable or project? If something qualifies, propose it — lesson ' +
  'text, scope, tags (with its skill: tag), status — and ask before writing anything. On approval, write ' +
  'portable lessons with `forge lessons write` and project ones under `## Lessons` in the owning skill.'

export const messages = {
  turns: every => `Forge lesson checkpoint (automatic, every ${every === 1 ? 'turn' : `${every} turns`}). ` +
    `Before you stop, review this conversation since the last checkpoint. ${REVIEW} ` +
    'If nothing qualifies, stop without mentioning this checkpoint.',
  commit: () => 'Forge lesson checkpoint: this commit was held once, on purpose. Before committing, review the ' +
    `work it contains and the conversation that led to it. ${REVIEW} Then run the same commit again; it will ` +
    'go through. If nothing qualifies, just run it again without mentioning this checkpoint.',
  pr: () => 'Forge harvest checkpoint: this pull request was held once, on purpose. Harvest runs before the PR: ' +
    'follow the harvest skill over this branch (the four questions, pruning stale lines, portable candidates ' +
    'shown for approval). Commit any project-lesson edits to the branch. Then create the same pull request ' +
    'again; it will go through. If nothing qualifies, just create it again without mentioning this checkpoint.',
  compact: () => 'Forge lesson checkpoint: the conversation was just compacted, so the detail of the earlier ' +
    'part is gone and only the summary above remains. Read that summary for anything not yet captured. ' +
    `${REVIEW} Do this at your next natural stopping point, not in the middle of a step. If nothing ` +
    'qualifies, carry on without mentioning this checkpoint.',
}

/** What a PreToolUse call is: 'commit', 'pr', or null. */
export function gitAction(toolName, toolInput) {
  if (/^mcp__.+__create_pull_request$/.test(toolName ?? '')) return 'pr'
  if (toolName !== 'Bash') return null
  const cmd = String(toolInput?.command ?? '')
  if (/\bgh\s+pr\s+create\b/.test(cmd)) return 'pr'
  // `git commit`, also with options before the subcommand (`git -C dir commit`)
  if (/\bgit(\s+-[\w-]+(\s+(?!commit\b)[^\s-]\S*)?)*\s+commit(?![-\w])/.test(cmd)) return 'commit'
  return null
}

const deny = reason => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
})

/** Decide for one hook event. Returns the hook's stdout ('' to stay silent). */
export function checkpoint(input, { home = homedir(), now = Date.now() } = {}) {
  if (!input.session_id) return ''
  // runs before every shell command: leave the rest untouched, and fast
  if (input.hook_event_name === 'PreToolUse' && !gitAction(input.tool_name, input.tool_input)) return ''
  const s = settings(findConfig(home, input.cwd || process.cwd()))
  if (!s) return ''

  const dir = join(home, '.claude', 'forge', 'sessions')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${String(input.session_id).replace(/[^\w-]/g, '_')}.json`)
  const state = { turns: 0, held: {}, ...readJson(file) }
  const save = () => writeFileSync(file, JSON.stringify(state) + '\n')

  // counters of sessions that ended long ago
  for (const name of readdirSync(dir)) {
    const f = join(dir, name)
    try { if (now - statSync(f).mtimeMs > STALE_MS) unlinkSync(f) } catch {}
  }

  switch (input.hook_event_name) {
    case 'Stop': {
      if (input.stop_hook_active || s.every <= 0) return ''
      state.turns += 1
      const due = state.turns >= s.every
      if (due) state.turns = 0
      save()
      return due ? JSON.stringify({ decision: 'block', reason: messages.turns(s.every) }) : ''
    }
    case 'PreToolUse': {
      const action = gitAction(input.tool_name, input.tool_input)
      if (!action || !s[action]) return ''
      const held = state.held[action]
      if (held && now - held < RETRY_MS) {
        delete state.held[action]
        save()
        return ''
      }
      state.held[action] = now
      // the harvest may commit lesson edits; that commit should not be held again
      if (action === 'pr') state.held.commit = now
      state.turns = 0
      save()
      return deny(messages[action]())
    }
    case 'SessionStart': {
      if (input.source !== 'compact' || !s.compact) return ''
      state.turns = 0
      save()
      return messages.compact()
    }
  }
  return ''
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = ''
  process.stdin.on('data', d => { raw += d })
  process.stdin.on('end', () => {
    try {
      const out = checkpoint(JSON.parse(raw || '{}'), { home: process.env.HOME || homedir() })
      if (out) process.stdout.write(out)
    } catch {}
    process.exit(0)
  })
}
