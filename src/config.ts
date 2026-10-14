import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, isAbsolute } from 'node:path'
import type { StoreConfig } from './store/types.js'

export interface ForgeConfig {
  store: StoreConfig
}

export const DEFAULT_CONFIG: ForgeConfig = {
  store: { backend: 'local', path: join(homedir(), '.claude', 'forge', 'lessons') },
}

function expand(p: string, home: string): string {
  if (p.startsWith('~/') || p === '~') return join(home, p.slice(1))
  return isAbsolute(p) ? p : join(home, p)
}

export async function loadConfig(home: string = homedir()): Promise<ForgeConfig> {
  const file = join(home, '.claude', 'forge', 'config.json')
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { store: { ...DEFAULT_CONFIG.store, path: expand('~/.claude/forge/lessons', home) } }
    }
    throw e
  }

  const parsed = JSON.parse(raw) as ForgeConfig
  const backend = parsed.store?.backend
  if (backend !== 'local' && backend !== 'git') {
    throw new Error(`unknown store backend in ${file}: ${String(backend)}`)
  }
  return { store: { ...parsed.store, path: expand(parsed.store.path, home) } }
}

/** The project file that overrides the machine config for one project. */
export const PROJECT_FILE = '.forge.json'

export interface ResolvedConfig extends ForgeConfig {
  /** Where the config came from: a project's .forge.json, the machine config, or the default. */
  source: { kind: 'project' | 'machine' | 'default'; file: string | null }
}

function validate(parsed: ForgeConfig, file: string): void {
  const backend = parsed.store?.backend
  if (backend !== 'local' && backend !== 'git') {
    throw new Error(`unknown store backend in ${file}: ${String(backend)}`)
  }
  if (typeof parsed.store.path !== 'string' || !parsed.store.path) throw new Error(`store.path missing in ${file}`)
}

/**
 * The project's .forge.json if one exists in `cwd` or a parent (stopping at the
 * home directory), otherwise the machine config. A project file is meant to be
 * committed and shared, so its path should start with `~/`; a relative path is
 * taken relative to the project file.
 */
export async function resolveConfig(home: string = homedir(), cwd: string = process.cwd()): Promise<ResolvedConfig> {
  let dir = cwd
  for (;;) {
    const file = join(dir, PROJECT_FILE)
    let raw: string | null = null
    try { raw = await readFile(file, 'utf8') } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    if (raw !== null) {
      let parsed: ForgeConfig
      try { parsed = JSON.parse(raw) } catch { throw new Error(`${file} is not valid JSON`) }
      validate(parsed, file)
      const p = parsed.store.path
      const path = p.startsWith('~') ? expand(p, home) : isAbsolute(p) ? p : join(dir, p)
      return { store: { ...parsed.store, path }, source: { kind: 'project', file } }
    }
    const parent = dirname(dir)
    if (dir === home || parent === dir) break
    dir = parent
  }
  const machine = join(home, '.claude', 'forge', 'config.json')
  const config = await loadConfig(home)
  const exists = await readFile(machine).then(() => true, () => false)
  return { ...config, source: exists ? { kind: 'machine', file: machine } : { kind: 'default', file: null } }
}
