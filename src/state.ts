import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export type Phase = 'scope' | 'architecture' | 'design' | 'build'
export type SizeClass = 'throwaway' | 'tool' | 'product'

export interface Escalation {
  from: Phase
  owner: Phase
  conflict: string
  proposal: string
  raised: string
}

export interface ForgeState {
  phase: Phase
  sizeClass: SizeClass | null
  /** Set by scope: whether any user-facing UI is in scope. Absent in pre-design state files. */
  hasUI?: boolean | null
  approvals: Partial<Record<Phase, string | null>>
  escalation: Escalation | null
}

export class PhaseGateError extends Error {}

const STATE_PATH = join('docs', 'forge', 'state.json')

export async function readState(projectDir: string): Promise<ForgeState | null> {
  try {
    return JSON.parse(await readFile(join(projectDir, STATE_PATH), 'utf8')) as ForgeState
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function writeState(projectDir: string, state: ForgeState): Promise<void> {
  const file = join(projectDir, STATE_PATH)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/**
 * The gate. Scope always runs. Architecture needs an approved scope. Design needs
 * an approved architecture and UI in scope. Build needs an approved architecture,
 * and an approved design when UI is in scope — except for a throwaway, which skips
 * both. An open escalation blocks everything — the project is parked on a
 * conflict, not waiting on progress.
 */
export function assertPhaseAllowed(state: ForgeState | null, phase: Phase): void {
  if (state?.escalation) {
    throw new PhaseGateError(
      `an escalation raised by the ${state.escalation.from} phase is open and owned by ` +
      `the ${state.escalation.owner} phase:\n  conflict: ${state.escalation.conflict}\n` +
      `  proposal: ${state.escalation.proposal}\n` +
      `Resolve it before continuing.`,
    )
  }

  if (phase === 'scope') return
  if (!state) {
    throw new PhaseGateError(`cannot run ${phase}: no scope has been captured — run /forge:scope first`)
  }

  if (phase === 'architecture' && !state.approvals.scope) {
    throw new PhaseGateError('cannot run architecture: the scope is not approved yet')
  }

  if (phase === 'design') {
    if (!state.approvals.scope) {
      throw new PhaseGateError('cannot run design: the scope is not approved yet')
    }
    if (state.sizeClass === 'throwaway') {
      throw new PhaseGateError('cannot run design: a throwaway skips the design phase — run /forge:build')
    }
    if (state.hasUI === false) {
      throw new PhaseGateError('cannot run design: the scope puts no user-facing UI in scope')
    }
    if (!state.approvals.architecture) {
      throw new PhaseGateError('cannot run design: the architecture is not approved yet')
    }
  }

  if (phase === 'build') {
    if (!state.approvals.scope) {
      throw new PhaseGateError('cannot run build: the scope is not approved yet')
    }
    if (state.sizeClass !== 'throwaway' && !state.approvals.architecture) {
      throw new PhaseGateError(
        `cannot run build: the architecture is not approved yet ` +
        `(a ${state.sizeClass} project does not skip the architecture phase)`,
      )
    }
    if (state.sizeClass !== 'throwaway' && state.hasUI === true && !state.approvals.design) {
      throw new PhaseGateError(
        'cannot run build: the design is not approved yet (UI is in scope) — run /forge:design',
      )
    }
  }
}
