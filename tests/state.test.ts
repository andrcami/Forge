import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readState, writeState, assertPhaseAllowed, PhaseGateError, type ForgeState } from '../src/state.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'forge-state-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const scoped: ForgeState = {
  phase: 'scope', sizeClass: 'product',
  approvals: { scope: '2026-08-31T10:22:00Z' }, escalation: null,
}

describe('state persistence', () => {
  it('returns null when no state file exists', async () => {
    expect(await readState(dir)).toBeNull()
  })

  it('round-trips state through the file, surviving a session restart', async () => {
    await writeState(dir, scoped)
    expect(await readState(dir)).toEqual(scoped)
  })
})

describe('assertPhaseAllowed', () => {
  it('allows scope with no prior state', () => {
    expect(() => assertPhaseAllowed(null, 'scope')).not.toThrow()
  })

  it('refuses architecture when scope is unapproved', () => {
    const s: ForgeState = { ...scoped, approvals: { scope: null } }
    expect(() => assertPhaseAllowed(s, 'architecture')).toThrow(PhaseGateError)
  })

  it('allows architecture once scope is approved', () => {
    expect(() => assertPhaseAllowed(scoped, 'architecture')).not.toThrow()
  })

  it('refuses build when architecture is unapproved for a product', () => {
    expect(() => assertPhaseAllowed(scoped, 'build')).toThrow(PhaseGateError)
  })

  it('allows build straight after scope for a throwaway — architecture is skipped', () => {
    const s: ForgeState = { ...scoped, sizeClass: 'throwaway' }
    expect(() => assertPhaseAllowed(s, 'build')).not.toThrow()
  })

  it('refuses design before the architecture is approved', () => {
    const s: ForgeState = { ...scoped, hasUI: true }
    expect(() => assertPhaseAllowed(s, 'design')).toThrow(/architecture is not approved/)
  })

  it('refuses design when no UI is in scope', () => {
    const s: ForgeState = { ...scoped, hasUI: false, approvals: { ...scoped.approvals, architecture: '2026-08-31T11:00:00Z' } }
    expect(() => assertPhaseAllowed(s, 'design')).toThrow(/no user-facing UI/)
  })

  it('refuses design for a throwaway', () => {
    const s: ForgeState = { ...scoped, sizeClass: 'throwaway', hasUI: true }
    expect(() => assertPhaseAllowed(s, 'design')).toThrow(/throwaway skips/)
  })

  it('allows design once architecture is approved and UI is in scope', () => {
    const s: ForgeState = { ...scoped, hasUI: true, approvals: { ...scoped.approvals, architecture: '2026-08-31T11:00:00Z' } }
    expect(() => assertPhaseAllowed(s, 'design')).not.toThrow()
  })

  it('refuses build when UI is in scope and the design is unapproved', () => {
    const s: ForgeState = { ...scoped, hasUI: true, approvals: { ...scoped.approvals, architecture: '2026-08-31T11:00:00Z' } }
    expect(() => assertPhaseAllowed(s, 'build')).toThrow(/design is not approved/)
  })

  it('allows build without a design when no UI is in scope', () => {
    const s: ForgeState = { ...scoped, hasUI: false, approvals: { ...scoped.approvals, architecture: '2026-08-31T11:00:00Z' } }
    expect(() => assertPhaseAllowed(s, 'build')).not.toThrow()
  })

  it('does not gate build on design for state files written before the design phase existed', () => {
    const s: ForgeState = { ...scoped, approvals: { ...scoped.approvals, architecture: '2026-08-31T11:00:00Z' } }
    expect(() => assertPhaseAllowed(s, 'build')).not.toThrow()
  })

  it('allows build for a throwaway with UI — design is skipped', () => {
    const s: ForgeState = { ...scoped, sizeClass: 'throwaway', hasUI: true }
    expect(() => assertPhaseAllowed(s, 'build')).not.toThrow()
  })

  it('refuses any phase while an escalation is open', () => {
    const s: ForgeState = {
      ...scoped,
      escalation: {
        from: 'architecture', owner: 'scope',
        conflict: 'no candidate survives the budget at the stated scale',
        proposal: 'cut realtime from scope, or raise the ops budget',
        raised: '2026-08-31T12:00:00Z',
      },
    }
    expect(() => assertPhaseAllowed(s, 'architecture')).toThrow(/escalation/)
  })
})
