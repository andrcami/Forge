import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { resolveClaudeBin, type ClaudeBinDeps } from '../evals/src/claude-bin.js'

const exe = (root: string) => join(root, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')

function deps(over: Partial<ClaudeBinDeps> & { files?: string[] } = {}): ClaudeBinDeps {
  const files = new Set(over.files ?? [])
  return {
    platform: 'win32',
    env: {},
    exists: p => files.has(p),
    npmRoot: () => null,
    where: () => [],
    ...over,
  }
}

describe('resolveClaudeBin', () => {
  it('honours CLAUDE_BIN on every platform', () => {
    expect(resolveClaudeBin(deps({ env: { CLAUDE_BIN: 'D:/tools/claude.exe' } }))).toBe('D:/tools/claude.exe')
    expect(resolveClaudeBin(deps({ platform: 'linux', env: { CLAUDE_BIN: '/opt/claude' } }))).toBe('/opt/claude')
  })

  it('keeps plain claude on POSIX without probing anything', () => {
    const boom = () => { throw new Error('must not probe') }
    for (const platform of ['linux', 'darwin'] as const)
      expect(resolveClaudeBin(deps({ platform, npmRoot: boom, where: boom, exists: boom }))).toBe('claude')
  })

  it('prefers a claude.exe on PATH on Windows', () => {
    const onPath = 'C:/Users/u/.local/bin/claude.exe'
    const npm = 'C:/Users/u/AppData/Roaming/npm/node_modules'
    expect(resolveClaudeBin(deps({ where: () => [onPath], npmRoot: () => npm, files: [onPath, exe(npm)] }))).toBe(onPath)
  })

  it('falls back to the npm package binary under npm root -g', () => {
    const npm = 'E:/npm-global/node_modules'
    expect(resolveClaudeBin(deps({ npmRoot: () => npm, files: [exe(npm)] }))).toBe(exe(npm))
  })

  it('falls back to the default npm prefix under APPDATA when npm root is unavailable', () => {
    const appdata = 'C:/Users/u/AppData/Roaming'
    const path = exe(join(appdata, 'npm', 'node_modules'))
    expect(resolveClaudeBin(deps({ env: { APPDATA: appdata }, files: [path] }))).toBe(path)
  })

  it('skips candidates that do not exist, and ends at claude.exe', () => {
    expect(resolveClaudeBin(deps({ where: () => ['C:/gone/claude.exe'], npmRoot: () => 'C:/npm', env: { APPDATA: 'C:/a' } })))
      .toBe('claude.exe')
  })
})
