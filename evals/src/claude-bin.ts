/**
 * Which executable the eval runner starts as `claude`.
 *
 * On Windows, npm installs `claude` as a POSIX shell script plus `claude.cmd`,
 * and Node's spawn cannot start either without a shell. A shell is not an
 * option here: the arguments carry prompt text, and quoting it through cmd.exe
 * is fragile. So on Windows this finds the real `claude.exe` instead. POSIX
 * keeps plain `claude` from PATH.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ClaudeBinDeps {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  exists: (path: string) => boolean
  /** `npm root -g`, or null when npm is unavailable. */
  npmRoot: () => string | null
  /** Every `claude.exe` on PATH (`where claude.exe`), in PATH order. */
  where: () => string[]
}

const PACKAGE_EXE = ['@anthropic-ai', 'claude-code', 'bin', 'claude.exe']

/**
 * `CLAUDE_BIN` wins everywhere. Otherwise POSIX gets `claude`, and Windows gets
 * the first existing of: a `claude.exe` on PATH (the native installer), the npm
 * package's binary under `npm root -g`, then under the default npm prefix in
 * %APPDATA%. If none exists, `claude.exe`, so spawn's ENOENT names what is missing.
 */
export function resolveClaudeBin(deps: ClaudeBinDeps): string {
  const override = deps.env.CLAUDE_BIN?.trim()
  if (override) return override
  if (deps.platform !== 'win32') return 'claude'

  const candidates: string[] = [...deps.where()]
  const root = deps.npmRoot()
  if (root) candidates.push(join(root, ...PACKAGE_EXE))
  if (deps.env.APPDATA) candidates.push(join(deps.env.APPDATA, 'npm', 'node_modules', ...PACKAGE_EXE))
  return candidates.find(c => deps.exists(c)) ?? 'claude.exe'
}

function quiet<T>(f: () => T, fallback: T): T {
  try { return f() } catch { return fallback }
}

/** The real-machine dependencies. */
export const systemDeps: ClaudeBinDeps = {
  platform: process.platform,
  env: process.env,
  exists: existsSync,
  // npm is npm.cmd on Windows, so this needs a shell; the command is fixed, with no user input in it
  npmRoot: () => quiet(() => execFileSync('npm root -g', { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null, null),
  where: () => quiet(() => execFileSync('where.exe', ['claude.exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean), []),
}
