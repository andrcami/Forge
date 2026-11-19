#!/usr/bin/env node
/**
 * The eval's permission prompt handler: a minimal MCP stdio server with one tool,
 * passed to the nested session as `--permission-prompt-tool`.
 *
 *   node approve-skill-writes.mjs <workspace>
 *
 * Claude Code treats `.claude/skills/` as sensitive. Even in acceptEdits mode, and
 * even with an Edit(...) allow rule or a PreToolUse hook that allows it, a write
 * there becomes a permission prompt, and in `-p` nobody answers it. Harvest's job
 * is to write lessons into those skills, so this answers exactly that prompt: an
 * Edit, MultiEdit, or Write whose target resolves inside <workspace>/.claude/skills/
 * is allowed. Every other prompt is denied, as it is without this handler.
 * The handler is only consulted for what would otherwise prompt; deny rules and the
 * allowlist still apply first.
 */
import { createInterface } from 'node:readline'
import { isAbsolute, relative, resolve } from 'node:path'

const TOOL = 'approve'
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write'])

function insideSkills(workspace, filePath) {
  if (typeof filePath !== 'string' || !filePath) return false
  const fold = p => (process.platform === 'win32' ? p.toLowerCase() : p)
  const rel = relative(fold(resolve(workspace, '.claude', 'skills')), fold(resolve(workspace, filePath)))
  return rel !== '' && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel)
}

function decide(workspace, { tool_name: tool, input } = {}) {
  if (workspace && EDIT_TOOLS.has(tool) && insideSkills(workspace, input?.file_path))
    return { behavior: 'allow', updatedInput: input }
  return { behavior: 'deny', message: `Forge eval: nobody can approve ${tool ?? 'this'} here; only writes inside the workspace's .claude/skills/ are approved.` }
}

const workspace = process.argv[2]
const send = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')

createInterface({ input: process.stdin }).on('line', line => {
  let req
  try { req = JSON.parse(line) } catch { return }
  const { id, method, params } = req
  if (id === undefined) return // notifications need no reply
  if (method === 'initialize') return send({ id, result: {
    protocolVersion: params?.protocolVersion ?? '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: { name: 'forge-eval', version: '1.0.0' },
  } })
  if (method === 'tools/list') return send({ id, result: { tools: [{
    name: TOOL,
    description: 'Answers permission prompts for the Forge eval session.',
    inputSchema: {
      type: 'object',
      properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
      required: ['tool_name', 'input'],
    },
  }] } })
  if (method === 'tools/call' && params?.name === TOOL)
    return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(decide(workspace, params.arguments)) }] } })
  if (method === 'ping') return send({ id, result: {} })
  send({ id, error: { code: -32601, message: `unsupported: ${method}` } })
})
