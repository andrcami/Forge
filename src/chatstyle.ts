import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

/**
 * Chat style: whether the user talks to Claude in caveman mode. Forge does not
 * ship caveman; it detects it, offers it once, and records the answer so it
 * never asks again. Lessons and files follow Simplified Technical English
 * either way (references/writing/ste.md).
 */

export type ChatStyle = 'caveman' | 'normal'
export type Level = 'lite' | 'full'

export interface ChatStyleStatus {
  /** the caveman plugin: enabled in user settings, installed but not enabled, or neither */
  plugin: 'enabled' | 'installed' | 'absent'
  /** a caveman skill outside the plugin (user skills, or skills synced from an organisation) */
  skill: boolean
  /** Forge's default line in ~/.claude/CLAUDE.md, and its level */
  defaultLine: Level | null
  /** what the user chose, or null when never asked */
  choice: ChatStyle | null
}

/** The plugin and its source: the author's own marketplace. */
export const CAVEMAN_INSTALL = 'claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman'

const BEGIN = '<!-- forge:chat-style -->'
const END = '<!-- /forge:chat-style -->'
const BLOCK = new RegExp(`\\n?${BEGIN}[\\s\\S]*?${END}\\n?`)

const prefsFile = (home: string) => join(home, '.claude', 'forge', 'preferences.json')
const claudeMd = (home: string) => join(home, '.claude', 'CLAUDE.md')

async function readJson(file: string): Promise<Record<string, any> | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

async function hasCavemanSkill(home: string): Promise<boolean> {
  const skills = join(home, '.claude', 'skills')
  const found = (dir: string) => readFile(join(dir, 'caveman', 'SKILL.md')).then(() => true, () => false)
  if (await found(skills)) return true
  // skills synced from an organisation live one level down
  const synced = await readdir(join(skills, 'synced')).catch(() => [] as string[])
  for (const d of synced) if (await found(join(skills, 'synced', d))) return true
  return false
}

export async function chatStyleStatus(home: string): Promise<ChatStyleStatus> {
  const settings = await readJson(join(home, '.claude', 'settings.json'))
  const enabled = Object.entries(settings?.enabledPlugins ?? {}).some(([k, v]) => k.startsWith('caveman@') && v === true)
  const installedRaw = await readFile(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8').catch(() => '')
  const md = await readFile(claudeMd(home), 'utf8').catch(() => '')
  const line = md.match(BLOCK)?.[0] ?? ''
  const choice = (await readJson(prefsFile(home)))?.chatStyle
  return {
    plugin: enabled ? 'enabled' : /"caveman@/.test(installedRaw) ? 'installed' : 'absent',
    skill: await hasCavemanSkill(home),
    defaultLine: line ? (/\blite\b/.test(line) ? 'lite' : 'full') : null,
    choice: choice === 'caveman' || choice === 'normal' ? choice : null,
  }
}

function defaultLine(level: Level): string {
  return `${BEGIN}\nUse caveman mode (${level}) for chat by default. Code, commits, PRs, and Forge lessons stay normal.\n${END}`
}

/**
 * Records the choice. For caveman with a level, writes Forge's default line to
 * ~/.claude/CLAUDE.md (replacing an earlier one); for normal, removes it.
 * Anything else in CLAUDE.md is left as it is. Returns what changed.
 */
export async function setChatStyle(home: string, style: ChatStyle, level?: Level): Promise<string[]> {
  const done: string[] = []
  const prefs = { ...(await readJson(prefsFile(home))), chatStyle: style }
  await mkdir(dirname(prefsFile(home)), { recursive: true })
  await writeFile(prefsFile(home), JSON.stringify(prefs, null, 2) + '\n')
  done.push(`recorded chat style: ${style}`)

  const md = await readFile(claudeMd(home), 'utf8').catch(() => null)
  const without = md === null ? null : md.replace(BLOCK, '\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
  if (style === 'caveman' && level) {
    const base = (without ?? '').replace(/\s*$/, '')
    await mkdir(dirname(claudeMd(home)), { recursive: true })
    await writeFile(claudeMd(home), (base ? base + '\n\n' : '') + defaultLine(level) + '\n')
    done.push(`${claudeMd(home)}: caveman (${level}) on by default`)
  } else if (md !== null && BLOCK.test(md)) {
    await writeFile(claudeMd(home), without!.replace(/^\n+/, ''))
    done.push(`${claudeMd(home)}: removed Forge's chat-style line`)
  }
  return done
}

export function describe(s: ChatStyleStatus): string[] {
  return [
    `choice:   ${s.choice ?? 'not asked yet'}`,
    `plugin:   caveman ${s.plugin === 'enabled' ? 'enabled (starts in every session)' : s.plugin === 'installed' ? 'installed, not enabled' : 'not installed'}`,
    `skill:    ${s.skill ? 'a caveman skill is available (on when you type /caveman)' : 'none'}`,
    `default:  ${s.defaultLine ? `caveman (${s.defaultLine}) via ~/.claude/CLAUDE.md` : 'no Forge line in ~/.claude/CLAUDE.md'}`,
    ...(s.plugin === 'absent' ? [`install:  ${CAVEMAN_INSTALL}`] : []),
  ]
}
