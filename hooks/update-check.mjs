#!/usr/bin/env node
// Forge update check (SessionStart). Never waits on the network: it compares the
// installed version with the latest one cached in ~/.claude/forge/update-check.json
// and, when a newer one exists, asks Claude to put the choice to the user once:
// update now, not now, skip this version, or always update. The answer comes back
// through `--choose`, which writes the config and runs the update, so Claude never
// edits the config by hand. With `"autoUpdate": true` the hook starts the update
// itself, in a detached child, and only tells Claude to mention it. When the cache
// is older than a day it refreshes it in a detached child, for the next session.
// Silent when up to date, when turned off, when the version was skipped, or on any
// error.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = fileURLToPath(import.meta.url)
export const LATEST_URL = 'https://raw.githubusercontent.com/andrcami/Forge/main/.claude-plugin/plugin.json'
export const UPDATE_COMMAND = 'claude plugin marketplace update forge && claude plugin update forge@forge'
export const CHOICES = ['update', 'skip', 'always']
const DAY_MS = 24 * 60 * 60 * 1000

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
const cacheFile = home => join(home, '.claude', 'forge', 'update-check.json')
const configFile = home => join(home, '.claude', 'forge', 'config.json')

/** 1 when a is newer than b, -1 when older, 0 when equal or either is not x.y.z. */
export function compare(a, b) {
  const parse = v => /^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').map(Number) : null
  const x = parse(a), y = parse(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

const manual = 'run `/plugin marketplace update forge` and then `/plugin update forge@forge` ' +
  `(or from a shell: \`${UPDATE_COMMAND}\`), then start a new session`

/** The notice that asks Claude to put the choice to the user. */
export function message(installed, latest, script = SELF) {
  const choose = c => `\`node "${script}" --choose ${c}\``
  return `Forge ${latest} is available; this session runs ${installed}. Ask the user once, briefly, ` +
    'when it won\'t interrupt their task (before you start it or once it is done), with your question tool ' +
    '(AskUserQuestion), whether to update. Offer exactly these options: ' +
    `"Update now" — then run ${choose('update')}; ` +
    '"Not now" — do nothing, they are asked again next session; ' +
    `"Skip ${latest}" — then run ${choose('skip')}, and they are not asked again until a newer version ships; ` +
    `"Always update" — then run ${choose('always')}, which updates now and installs future versions without asking. ` +
    'Run nothing until they choose, and nothing else to update. The update takes effect in a new session: ' +
    'tell them so. If the command fails, show its output and give the manual steps: ' + manual + '.'
}

/** The notice when autoUpdate is on and the hook has started the update itself. */
export function autoMessage(installed, latest) {
  return `Forge is updating from ${installed} to ${latest} in the background (autoUpdate is on). ` +
    'Mention it to the user once, briefly: it takes effect in a new session. Turn it off with ' +
    '`"autoUpdate": false` in `~/.claude/forge/config.json`. Do not run anything for it.'
}

/** Decide for one SessionStart. Returns the hook's stdout, whether the cache needs refreshing, and whether to update. */
export function check({ home = homedir(), root = ROOT, now = Date.now(), env = process.env, script = SELF } = {}) {
  const none = { out: '', refresh: false, update: false }
  if (env.FORGE_NO_UPDATE_CHECK) return none
  const config = readJson(configFile(home)) ?? {}
  if (config.updateCheck === false) return none
  const installed = readJson(join(root, '.claude-plugin', 'plugin.json'))?.version
  const cache = readJson(cacheFile(home))
  const refresh = !cache?.checkedAt || now - cache.checkedAt > DAY_MS
  const latest = cache?.latest
  const newer = installed && compare(latest, installed) > 0
  // A skipped version stays quiet; one newer than it asks again.
  if (!newer || (config.skipVersion && compare(latest, config.skipVersion) <= 0)) return { ...none, refresh }
  if (config.autoUpdate === true) return { out: autoMessage(installed, latest), refresh, update: true }
  return { out: message(installed, latest, script), refresh, update: false }
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

/** Merge keys into ~/.claude/forge/config.json, keeping everything else in it. */
export function setConfig(home, patch) {
  const file = configFile(home)
  const next = { ...(readJson(file) ?? {}), ...patch }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
}

/** Run the update and return its exit code. `run` is injectable for tests. */
export function runUpdate(run = cmd => spawnSync(cmd, { shell: true, stdio: 'inherit', windowsHide: true }).status ?? 1) {
  return run(UPDATE_COMMAND)
}

/** Act on the user's answer. Returns the process exit code. */
export function choose(choice, { home = homedir(), update = runUpdate } = {}) {
  if (!CHOICES.includes(choice)) {
    process.stderr.write(`forge update-check: unknown choice "${choice}" (expected ${CHOICES.join(', ')})\n`)
    return 2
  }
  const latest = readJson(cacheFile(home))?.latest
  if (choice === 'skip') {
    if (!latest) { process.stderr.write('forge update-check: no known version to skip\n'); return 1 }
    setConfig(home, { skipVersion: latest })
    process.stdout.write(`Skipped Forge ${latest}; you will be asked again when a newer version ships.\n`)
    return 0
  }
  if (choice === 'always') setConfig(home, { autoUpdate: true })
  setConfig(home, { skipVersion: undefined })
  const code = update()
  process.stdout.write(code === 0
    ? `Forge updated${latest ? ` to ${latest}` : ''}. Start a new session to load it.\n`
    : `Forge update failed (exit ${code}). Update by hand: ${manual}.\n`)
  return code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = process.env.HOME || homedir()
  if (process.argv[2] === '--refresh') {
    refresh({ home }).catch(() => {}).finally(() => process.exit(0))
  } else if (process.argv[2] === '--choose') {
    process.exit(choose(process.argv[3], { home }))
  } else {
    try {
      const { out, refresh: stale, update } = check({ home })
      if (stale) {
        spawn(process.execPath, [SELF, '--refresh'],
          { detached: true, stdio: 'ignore', env: process.env, windowsHide: true }).unref()
      }
      if (update) {
        spawn(UPDATE_COMMAND, { shell: true, detached: true, stdio: 'ignore', env: process.env, windowsHide: true }).unref()
      }
      if (out) process.stdout.write(out)
    } catch {}
    process.exit(0)
  }
}
