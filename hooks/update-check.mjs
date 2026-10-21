#!/usr/bin/env node
// Forge update check (SessionStart). Never waits on the network: it compares the
// installed version with the latest one cached in ~/.claude/forge/update-check.json
// and, when a newer one exists, asks Claude to mention the update once. When the
// cache is older than a day it refreshes it in a detached child, for the next
// session. Silent when up to date, when turned off, or on any error.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const LATEST_URL = 'https://raw.githubusercontent.com/andrcami/Forge/main/.claude-plugin/plugin.json'
const DAY_MS = 24 * 60 * 60 * 1000

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
const cacheFile = home => join(home, '.claude', 'forge', 'update-check.json')

/** 1 when a is newer than b, -1 when older, 0 when equal or either is not x.y.z. */
export function compare(a, b) {
  const parse = v => /^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').map(Number) : null
  const x = parse(a), y = parse(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

export function message(installed, latest) {
  return `Forge ${latest} is available; this session runs ${installed}. Mention it to the user once, briefly, ` +
    'when it won\'t interrupt their task: to update, run `/plugin marketplace update forge` and then ' +
    '`/plugin update forge@forge` (or from a shell: `claude plugin marketplace update forge && claude plugin ' +
    'update forge@forge`), then start a new session. Do not run the update yourself.'
}

/** Decide for one SessionStart. Returns the hook's stdout, and whether the cache needs refreshing. */
export function check({ home = homedir(), root = ROOT, now = Date.now(), env = process.env } = {}) {
  if (env.FORGE_NO_UPDATE_CHECK) return { out: '', refresh: false }
  if (readJson(join(home, '.claude', 'forge', 'config.json'))?.updateCheck === false) return { out: '', refresh: false }
  const installed = readJson(join(root, '.claude-plugin', 'plugin.json'))?.version
  const cache = readJson(cacheFile(home))
  const refresh = !cache?.checkedAt || now - cache.checkedAt > DAY_MS
  const out = installed && compare(cache?.latest, installed) > 0 ? message(installed, cache.latest) : ''
  return { out, refresh }
}

/** Fetch the latest version and cache it. Records the attempt even when it fails, so a day passes before the next. */
export async function refresh({ home = homedir(), url = process.env.FORGE_UPDATE_URL || LATEST_URL, now = Date.now() } = {}) {
  const prior = readJson(cacheFile(home)) ?? {}
  let latest = prior.latest ?? null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (res.ok) latest = (await res.json()).version ?? latest
  } catch {}
  mkdirSync(dirname(cacheFile(home)), { recursive: true })
  writeFileSync(cacheFile(home), JSON.stringify({ latest, checkedAt: now }) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = process.env.HOME || homedir()
  if (process.argv[2] === '--refresh') {
    refresh({ home }).catch(() => {}).finally(() => process.exit(0))
  } else {
    try {
      const { out, refresh: stale } = check({ home })
      if (stale) {
        spawn(process.execPath, [fileURLToPath(import.meta.url), '--refresh'],
          { detached: true, stdio: 'ignore', env: process.env }).unref()
      }
      if (out) process.stdout.write(out)
    } catch {}
    process.exit(0)
  }
}
