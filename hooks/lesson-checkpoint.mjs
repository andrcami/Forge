#!/usr/bin/env node
// Forge lesson checkpoint (Stop hook). Every N turns of a session, holds Claude
// back from stopping once and asks it to look for lessons worth keeping and
// propose them. It never writes a lesson: the user still approves each one.
// Silent when no library is configured, when disabled, or on any error.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_EVERY = 5
const STALE_MS = 7 * 24 * 60 * 60 * 1000

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

export function message(every) {
  return [
    `Forge lesson checkpoint (automatic, every ${every === 1 ? 'turn' : `${every} turns`}). Before you stop, review this conversation`,
    'since the last checkpoint for lessons worth keeping: corrections the user made, mistakes you made and',
    'then fixed, tool or provider behaviour that surprised you, and rules the user stated.',
    'Apply the harvest test to each: durable and general? which skill owns it? portable or project?',
    'If something qualifies, propose it — lesson text, scope, tags (with its skill: tag), status — and ask',
    'before writing anything. On approval, write portable lessons with `forge lessons write` and project',
    'ones under `## Lessons` in the owning skill. If nothing qualifies, stop without mentioning this checkpoint.',
  ].join(' ')
}

/** Decide for one Stop event. Returns the hook's stdout ('' to stay silent). */
export function checkpoint(input, { home = homedir(), now = Date.now() } = {}) {
  if (input.stop_hook_active || !input.session_id) return ''
  const config = findConfig(home, input.cwd || process.cwd())
  if (!config?.store) return ''
  const every = Number.isInteger(config.lessonCheckpointEvery) ? config.lessonCheckpointEvery : DEFAULT_EVERY
  if (every <= 0) return ''

  const dir = join(home, '.claude', 'forge', 'sessions')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${String(input.session_id).replace(/[^\w-]/g, '_')}.json`)
  const turns = (readJson(file)?.turns ?? 0) + 1
  const due = turns >= every
  writeFileSync(file, JSON.stringify({ turns: due ? 0 : turns }) + '\n')

  // counters of sessions that ended long ago
  for (const name of readdirSync(dir)) {
    const f = join(dir, name)
    try { if (now - statSync(f).mtimeMs > STALE_MS) unlinkSync(f) } catch {}
  }

  return due ? JSON.stringify({ decision: 'block', reason: message(every) }) : ''
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
