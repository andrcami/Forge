import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'evals', 'src', 'approve-skill-writes.mjs')
const WS = join(tmpdir(), 'forge-eval-approver-ws')

/** Speaks MCP to the server: initialize, then one approve call per input. Returns each decision. */
async function decide(inputs: { tool_name: string; input: Record<string, unknown> }[]): Promise<{ behavior: string }[]> {
  const child = spawn(process.execPath, [SERVER, WS], { stdio: ['pipe', 'pipe', 'inherit'] })
  const lines: string[] = []
  let buf = ''
  const done = new Promise<void>(res => child.stdout.on('data', d => {
    buf += d
    const parts = buf.split('\n'); buf = parts.pop()!
    lines.push(...parts.filter(Boolean))
    if (lines.length === inputs.length + 1) res()
  }))
  const send = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
  send({ id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
  send({ method: 'notifications/initialized' })
  inputs.forEach((args, i) => send({ id: i + 1, method: 'tools/call', params: { name: 'approve', arguments: args } }))
  await done
  child.kill()
  return lines.slice(1).map(l => JSON.parse(JSON.parse(l).result.content[0].text))
}

describe('approve-skill-writes', () => {
  it('allows edits inside the workspace skills and denies everything else', async () => {
    const skill = join(WS, '.claude', 'skills', 'backend', 'SKILL.md')
    const got = await decide([
      { tool_name: 'Edit', input: { file_path: skill } },
      { tool_name: 'Write', input: { file_path: '.claude/skills/qa/SKILL.md' } },
      { tool_name: 'Edit', input: { file_path: join(WS, '.claude', 'settings.json') } },
      { tool_name: 'Edit', input: { file_path: join(WS, '.claude', 'skills', '..', 'settings.json') } },
      { tool_name: 'Write', input: { file_path: join(tmpdir(), 'elsewhere', '.claude', 'skills', 'x', 'SKILL.md') } },
      { tool_name: 'Bash', input: { command: 'rm -rf .claude/skills' } },
    ])
    expect(got.map(d => d.behavior)).toEqual(['allow', 'allow', 'deny', 'deny', 'deny', 'deny'])
  })
})
