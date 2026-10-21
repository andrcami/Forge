import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chatStyleStatus, setChatStyle } from '../src/chatstyle.js'
import { main } from '../src/cli.js'

let home: string, out: string[], err: string[]
const run = (...argv: string[]) => main(argv, { home, cwd: home, out: s => out.push(s), err: s => err.push(s) })
const put = async (rel: string, body: string) => {
  await mkdir(join(home, rel, '..'), { recursive: true })
  await writeFile(join(home, rel), body)
}
const claudeMd = () => readFile(join(home, '.claude/CLAUDE.md'), 'utf8')

beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'forge-chat-')); out = []; err = [] })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('chat style detection', () => {
  it('reports nothing on a fresh machine', async () => {
    expect(await chatStyleStatus(home)).toEqual({ plugin: 'absent', skill: false, defaultLine: null, choice: null })
  })

  it('tells an enabled plugin from an installed one', async () => {
    await put('.claude/plugins/installed_plugins.json', '{"plugins":{"caveman@caveman":[{}]}}')
    expect((await chatStyleStatus(home)).plugin).toBe('installed')
    await put('.claude/settings.json', '{"enabledPlugins":{"caveman@caveman":true,"forge@forge":true}}')
    expect((await chatStyleStatus(home)).plugin).toBe('enabled')
    await put('.claude/settings.json', '{"enabledPlugins":{"caveman@caveman":false}}')
    expect((await chatStyleStatus(home)).plugin).toBe('installed')
  })

  it('finds a caveman skill, user-level or synced from an organisation', async () => {
    await put('.claude/skills/synced/org_1/caveman/SKILL.md', '---\nname: caveman\n---')
    expect((await chatStyleStatus(home)).skill).toBe(true)
    await rm(join(home, '.claude/skills'), { recursive: true })
    await put('.claude/skills/caveman/SKILL.md', '---\nname: caveman\n---')
    expect((await chatStyleStatus(home)).skill).toBe(true)
  })
})

describe('setChatStyle', () => {
  it('records the choice, keeping other preferences', async () => {
    await put('.claude/forge/preferences.json', '{"other":1}')
    await setChatStyle(home, 'normal')
    expect(JSON.parse(await readFile(join(home, '.claude/forge/preferences.json'), 'utf8'))).toEqual({ other: 1, chatStyle: 'normal' })
    expect((await chatStyleStatus(home)).choice).toBe('normal')
  })

  it('adds one default line to CLAUDE.md, replaces it on a level change, and removes it for normal', async () => {
    await put('.claude/CLAUDE.md', '# Mine\n\nKeep this.\n')
    await setChatStyle(home, 'caveman', 'lite')
    expect(await claudeMd()).toMatch(/^# Mine\n\nKeep this\.\n\n<!-- forge:chat-style -->\nUse caveman mode \(lite\)/)
    await setChatStyle(home, 'caveman', 'full')
    const md = await claudeMd()
    expect(md.match(/forge:chat-style -->/g)).toHaveLength(2) // one block: begin and end
    expect(md).toMatch(/caveman mode \(full\)/)
    expect((await chatStyleStatus(home)).defaultLine).toBe('full')
    await setChatStyle(home, 'normal')
    expect(await claudeMd()).toBe('# Mine\n\nKeep this.\n')
  })

  it('creates CLAUDE.md when there is none, and leaves it alone for caveman without a level', async () => {
    await setChatStyle(home, 'caveman')
    await expect(claudeMd()).rejects.toThrow()
    await setChatStyle(home, 'caveman', 'lite')
    expect(await claudeMd()).toMatch(/^<!-- forge:chat-style -->\nUse caveman mode \(lite\)/)
  })
})

describe('forge chat-style', () => {
  it('shows the status and the install command, without a library', async () => {
    expect(await run('chat-style')).toBe(0)
    const text = out.join('\n')
    expect(text).toMatch(/choice:\s+not asked yet/)
    expect(text).toMatch(/install:\s+claude plugin marketplace add JuliusBrussee\/caveman && claude plugin install caveman@caveman/)
  })

  it('records a choice and a level', async () => {
    expect(await run('chat-style', 'caveman', '--level', 'lite', '--json')).toBe(0)
    expect(out[0]).toBe('recorded chat style: caveman')
    expect(JSON.parse(out.at(-1)!)).toMatchObject({ choice: 'caveman', defaultLine: 'lite' })
  })

  it('rejects a bad style or level', async () => {
    expect(await run('chat-style', 'grunt')).toBe(2)
    expect(await run('chat-style', 'normal', '--level', 'lite')).toBe(2)
    expect(await run('chat-style', 'caveman', '--level', 'ultra')).toBe(2)
  })
})
