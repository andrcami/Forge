# Forge Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Forge — a Claude Code plugin that drives a new project from scope through architecture into development, generates the project's skills from the architecture decision, and accumulates portable lessons in a git-backed library shared across every project it touches.

**Architecture:** A plugin directory of markdown skills plus one small TypeScript store module. Phase skills (`forge-scope`, `forge-architect`, `forge-build`) are thin drivers reading substance from `references/`; `forge-store` is the only code with logic worth unit-testing. Gate state lives in a JSON file in the target project, not in conversation memory. Lessons are markdown files with YAML frontmatter, stored in `lessons/` and synced by git.

**Tech Stack:** Node 20+, TypeScript, vitest, `gray-matter` (frontmatter parsing), `simple-git` (git backend). No framework, no server, no database.

**Spec:** `docs/superpowers/specs/2026-08-31-forge-framework-design.md`

## Global Constraints

- **Repo must stay private.** D8 stores lessons inside this repo; lessons name real auth findings and provider quirks. Never publish without first splitting `lessons/` to a separate private repo.
- **Node 20+**, ESM (`"type": "module"` in package.json).
- **Store operations are exactly four:** `list(tags?)`, `read(id)`, `write(lesson)`, `retire(id, reason)`. No others — the adapter seam depends on this surface staying small.
- **Lesson `id`** is kebab-case, unique, and is the filename stem (`lessons/<id>.md`).
- **`status`** is one of `observed` | `confirmed` | `retired`. No other values.
- **`scope`** is one of `project` | `portable`. Only `portable` lessons enter the library.
- **Tag namespaces:** `stack:*`, `skill:*`, `domain:*`, `platform:*`, `provider:*`, `arch:*`. `skill:` values must match a concern skill from the spec's generated-skills table (`backend`, `database`, `frontend`, `devops`, `gitflow`, `context-memory`, or a design-system/domain skill name).
- **Generated artifacts read normally** — `caveman` applies to interaction only, never to generated `SKILL.md` / `CLAUDE.md` content or commit messages.
- **Optional skills are detected, never required.** Every integration point degrades gracefully and states which path it took.
- **Lesson commits** are prefixed `lessons:` so `git log -- lessons/` stays readable alongside plugin releases.

---

## File Structure

```
Forge/
├── package.json                    ESM, vitest, deps
├── tsconfig.json
├── vitest.config.ts
├── .claude-plugin/plugin.json      plugin manifest
├── src/
│   ├── lesson.ts                   Lesson type, parse, serialize, validate
│   ├── store/
│   │   ├── types.ts                LessonStore interface (the adapter seam)
│   │   ├── local.ts                local-dir backend
│   │   ├── git.ts                  git backend (wraps local, adds pull/push)
│   │   └── index.ts                createStore(config) factory
│   ├── config.ts                   ~/.claude/forge/config.json load + defaults
│   └── state.ts                    docs/forge/state.json read/write/gate check
├── tests/
│   ├── lesson.test.ts
│   ├── store-local.test.ts
│   ├── store-git.test.ts
│   ├── config.test.ts
│   └── state.test.ts
├── commands/                       scope.md architect.md build.md harvest.md lessons.md
├── skills/
│   ├── forge-store/SKILL.md
│   ├── forge-lessons/SKILL.md
│   ├── forge-harvest/SKILL.md
│   ├── forge-scope/SKILL.md
│   ├── forge-architect/SKILL.md
│   └── forge-build/SKILL.md
├── references/
│   ├── discriminators.md
│   ├── stacks/*.md                 one per archetype
│   └── templates/                  generated SKILL.md + docs scaffolds
└── lessons/                        the library (git-synced)
```

Responsibility split: `lesson.ts` owns the format and knows nothing about storage; `store/*` owns persistence and knows nothing about phases; skills own workflow and call the store. Files that change together live together — the git backend wraps the local backend rather than duplicating file IO.

---

## Task 1: Repo scaffold and lesson format

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/lesson.ts`
- Test: `tests/lesson.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `Lesson` type, `parseLesson(raw: string): Lesson`, `serializeLesson(l: Lesson): string`, `validateLesson(l: unknown): Lesson` (throws `LessonValidationError` on bad input)

```typescript
export type LessonStatus = 'observed' | 'confirmed' | 'retired'
export type LessonScope = 'project' | 'portable'

export interface Evidence {
  project: string
  ref: string
  date: string      // ISO date, YYYY-MM-DD
}

export interface Lesson {
  id: string
  scope: LessonScope
  status: LessonStatus
  tags: string[]
  evidence: Evidence[]
  retired_reason: string | null
  body: string
}
```

- [ ] **Step 1: Initialize the package**

```bash
cd /c/dev-Projects/Forge
npm init -y
npm pkg set type=module name=forge version=0.1.0 private=true
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit"
npm i -D typescript vitest @types/node
npm i gray-matter simple-git
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Write .gitignore**

```
node_modules/
dist/
*.log
```

- [ ] **Step 5: Write the failing test**

Create `tests/lesson.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseLesson, serializeLesson, validateLesson, LessonValidationError } from '../src/lesson.js'

const VALID = `---
id: example-provider-auth-check
scope: portable
status: confirmed
tags: [stack:any, skill:backend, domain:webhooks]
evidence:
  - project: example-project
    ref: "PR #12"
    date: 2026-07-20
retired_reason: null
---
Verify a provider's real auth mechanism against its docs before writing the handler.
`

describe('parseLesson', () => {
  it('parses frontmatter and body', () => {
    const l = parseLesson(VALID)
    expect(l.id).toBe('example-provider-auth-check')
    expect(l.scope).toBe('portable')
    expect(l.status).toBe('confirmed')
    expect(l.tags).toEqual(['stack:any', 'skill:backend', 'domain:webhooks'])
    expect(l.evidence).toHaveLength(1)
    expect(l.evidence[0].ref).toBe('PR #12')
    expect(l.retired_reason).toBeNull()
    expect(l.body).toContain('Verify a provider')
  })
})

describe('serializeLesson', () => {
  it('round-trips through parse', () => {
    const l = parseLesson(VALID)
    const again = parseLesson(serializeLesson(l))
    expect(again).toEqual(l)
  })
})

describe('validateLesson', () => {
  it('rejects an unknown status', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), status: 'maybe' }))
      .toThrow(LessonValidationError)
  })

  it('rejects a non-kebab-case id', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), id: 'Provider Auth' }))
      .toThrow(LessonValidationError)
  })

  it('rejects a tag outside the known namespaces', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), tags: ['random:thing'] }))
      .toThrow(LessonValidationError)
  })

  it('requires retired_reason when status is retired', () => {
    expect(() => validateLesson({ ...parseLesson(VALID), status: 'retired', retired_reason: null }))
      .toThrow(LessonValidationError)
  })

  it('accepts a valid lesson unchanged', () => {
    const l = parseLesson(VALID)
    expect(validateLesson(l)).toEqual(l)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/lesson.test.ts`
Expected: FAIL — cannot resolve `../src/lesson.js`

- [ ] **Step 7: Write src/lesson.ts**

```typescript
import matter from 'gray-matter'

export type LessonStatus = 'observed' | 'confirmed' | 'retired'
export type LessonScope = 'project' | 'portable'

export interface Evidence {
  project: string
  ref: string
  date: string
}

export interface Lesson {
  id: string
  scope: LessonScope
  status: LessonStatus
  tags: string[]
  evidence: Evidence[]
  retired_reason: string | null
  body: string
}

export class LessonValidationError extends Error {}

const STATUSES: LessonStatus[] = ['observed', 'confirmed', 'retired']
const SCOPES: LessonScope[] = ['project', 'portable']
const TAG_NAMESPACES = ['stack', 'skill', 'domain', 'platform', 'provider', 'arch']
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseLesson(raw: string): Lesson {
  const { data, content } = matter(raw)
  return validateLesson({ ...data, body: content.trim() })
}

export function serializeLesson(l: Lesson): string {
  const { body, ...front } = l
  return matter.stringify(body + '\n', front)
}

export function validateLesson(input: unknown): Lesson {
  const l = input as Partial<Lesson>
  const fail = (m: string): never => { throw new LessonValidationError(m) }

  if (typeof l.id !== 'string' || !KEBAB.test(l.id)) fail(`id must be kebab-case: ${String(l.id)}`)
  if (!SCOPES.includes(l.scope as LessonScope)) fail(`scope must be one of ${SCOPES.join(' | ')}`)
  if (!STATUSES.includes(l.status as LessonStatus)) fail(`status must be one of ${STATUSES.join(' | ')}`)
  if (!Array.isArray(l.tags) || l.tags.length === 0) fail('tags must be a non-empty array')

  for (const t of l.tags as string[]) {
    const ns = t.split(':')[0]
    if (!TAG_NAMESPACES.includes(ns)) {
      fail(`tag "${t}" is outside the known namespaces: ${TAG_NAMESPACES.join(', ')}`)
    }
  }

  if (!Array.isArray(l.evidence)) fail('evidence must be an array')
  for (const e of l.evidence as Evidence[]) {
    if (!e.project || !e.ref) fail('each evidence entry needs project and ref')
    if (!ISO_DATE.test(e.date)) fail(`evidence date must be YYYY-MM-DD: ${e.date}`)
  }

  if (l.status === 'retired' && !l.retired_reason) {
    fail('a retired lesson must carry retired_reason')
  }
  if (typeof l.body !== 'string' || l.body.trim() === '') fail('body must be non-empty')

  return {
    id: l.id as string,
    scope: l.scope as LessonScope,
    status: l.status as LessonStatus,
    tags: l.tags as string[],
    evidence: l.evidence as Evidence[],
    retired_reason: l.retired_reason ?? null,
    body: (l.body as string).trim(),
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/lesson.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/lesson.ts tests/lesson.test.ts
git commit -m "feat(lesson): add lesson format with parse, serialize, and validation

Validation is enforced at write time rather than load time so a malformed
lesson never enters the library."
```

---

## Task 2: Local store backend

**Files:**
- Create: `src/store/types.ts`, `src/store/local.ts`
- Test: `tests/store-local.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `validateLesson`, `parseLesson`, `serializeLesson` from `src/lesson.ts`
- Produces: `LessonStore` interface with `list(tags?: string[]): Promise<Lesson[]>`, `read(id: string): Promise<Lesson | null>`, `write(lesson: Lesson): Promise<void>`, `retire(id: string, reason: string): Promise<void>`; and `LocalStore` class implementing it, constructed as `new LocalStore(dir: string)`

- [ ] **Step 1: Write the failing test**

Create `tests/store-local.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalStore } from '../src/store/local.js'
import type { Lesson } from '../src/lesson.js'

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'test-lesson',
    scope: 'portable',
    status: 'observed',
    tags: ['stack:any', 'skill:backend'],
    evidence: [{ project: 'example-project', ref: 'PR #1', date: '2026-08-31' }],
    retired_reason: null,
    body: 'A durable lesson.',
    ...over,
  }
}

let dir: string
let store: LocalStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  store = new LocalStore(dir)
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('LocalStore', () => {
  it('round-trips a written lesson', async () => {
    await store.write(lesson())
    expect(await store.read('test-lesson')).toEqual(lesson())
  })

  it('returns null for an unknown id', async () => {
    expect(await store.read('nope')).toBeNull()
  })

  it('lists all lessons when no tags are given', async () => {
    await store.write(lesson({ id: 'one' }))
    await store.write(lesson({ id: 'two' }))
    expect((await store.list()).map(l => l.id).sort()).toEqual(['one', 'two'])
  })

  it('filters by tag, matching lessons carrying every requested tag', async () => {
    await store.write(lesson({ id: 'be', tags: ['stack:any', 'skill:backend'] }))
    await store.write(lesson({ id: 'db', tags: ['stack:any', 'skill:database'] }))
    const hits = await store.list(['skill:backend'])
    expect(hits.map(l => l.id)).toEqual(['be'])
  })

  it('rejects a project-scoped lesson — the library holds portable only', async () => {
    await expect(store.write(lesson({ scope: 'project' }))).rejects.toThrow(/portable/)
  })

  it('rejects an invalid lesson at write time', async () => {
    await expect(store.write(lesson({ status: 'maybe' as never }))).rejects.toThrow()
  })

  it('retire sets status and reason, preserving the entry', async () => {
    await store.write(lesson())
    await store.retire('test-lesson', 'superseded by the adapter rule')
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('retired')
    expect(l?.retired_reason).toBe('superseded by the adapter rule')
    expect(l?.body).toBe('A durable lesson.')
  })

  it('retire throws for an unknown id', async () => {
    await expect(store.retire('nope', 'reason')).rejects.toThrow(/not found/)
  })

  it('write on an existing id promotes observed to confirmed and appends evidence', async () => {
    await store.write(lesson())
    await store.write(lesson({
      evidence: [{ project: 'other', ref: 'PR #9', date: '2026-09-01' }],
    }))
    const l = await store.read('test-lesson')
    expect(l?.status).toBe('confirmed')
    expect(l?.evidence).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-local.test.ts`
Expected: FAIL — cannot resolve `../src/store/local.js`

- [ ] **Step 3: Write src/store/types.ts**

```typescript
import type { Lesson } from '../lesson.js'

export interface LessonStore {
  list(tags?: string[]): Promise<Lesson[]>
  read(id: string): Promise<Lesson | null>
  write(lesson: Lesson): Promise<void>
  retire(id: string, reason: string): Promise<void>
}

export interface StoreConfig {
  backend: 'local' | 'git'
  path: string
  remote?: string
  subdir?: string
}
```

- [ ] **Step 4: Write src/store/local.ts**

```typescript
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseLesson, serializeLesson, validateLesson, type Lesson } from '../lesson.js'
import type { LessonStore } from './types.js'

export class LocalStore implements LessonStore {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return join(this.dir, `${id}.md`)
  }

  async list(tags?: string[]): Promise<Lesson[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return []
    }
    const lessons: Lesson[] = []
    for (const n of names.filter(n => n.endsWith('.md'))) {
      lessons.push(parseLesson(await readFile(join(this.dir, n), 'utf8')))
    }
    if (!tags?.length) return lessons
    return lessons.filter(l => tags.every(t => l.tags.includes(t)))
  }

  async read(id: string): Promise<Lesson | null> {
    try {
      return parseLesson(await readFile(this.file(id), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  async write(lesson: Lesson): Promise<void> {
    const valid = validateLesson(lesson)
    if (valid.scope !== 'portable') {
      throw new Error(
        `refusing to store a ${valid.scope}-scoped lesson: the library holds portable lessons only`,
      )
    }
    const merged = await this.merge(valid)
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(merged.id), serializeLesson(merged), 'utf8')
  }

  async retire(id: string, reason: string): Promise<void> {
    const existing = await this.read(id)
    if (!existing) throw new Error(`lesson not found: ${id}`)
    const retired = validateLesson({ ...existing, status: 'retired', retired_reason: reason })
    await writeFile(this.file(id), serializeLesson(retired), 'utf8')
  }

  /**
   * A second independent sighting promotes observed to confirmed and appends
   * its evidence — the lifecycle in the spec. A retired lesson stays retired;
   * re-adding one is a deliberate act, not a side effect of a harvest.
   */
  private async merge(incoming: Lesson): Promise<Lesson> {
    const existing = await this.read(incoming.id)
    if (!existing || existing.status === 'retired') return incoming

    const known = new Set(existing.evidence.map(e => `${e.project}|${e.ref}`))
    const added = incoming.evidence.filter(e => !known.has(`${e.project}|${e.ref}`))
    if (added.length === 0) return existing

    return validateLesson({
      ...existing,
      status: 'confirmed',
      evidence: [...existing.evidence, ...added],
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/store-local.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Commit**

```bash
git add src/store/types.ts src/store/local.ts tests/store-local.test.ts
git commit -m "feat(store): add the LessonStore interface and local backend

The four-operation surface is the adapter seam: a future HTTP or DB backend
implements this and nothing else changes. Second-sighting promotion lives in
the store so every backend inherits the same lifecycle."
```

---

## Task 3: Git store backend

**Files:**
- Create: `src/store/git.ts`, `src/store/index.ts`
- Test: `tests/store-git.test.ts`

**Interfaces:**
- Consumes: `LocalStore`, `LessonStore`, `StoreConfig`
- Produces: `GitStore` class implementing `LessonStore`, constructed as `new GitStore(repoDir: string, subdir: string, remote?: string)`; and `createStore(config: StoreConfig): LessonStore`

- [ ] **Step 1: Write the failing test**

Create `tests/store-git.test.ts`. It exercises a real local git remote — no network:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { GitStore } from '../src/store/git.js'
import { createStore } from '../src/store/index.js'
import type { Lesson } from '../src/lesson.js'

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'git-lesson',
    scope: 'portable',
    status: 'observed',
    tags: ['stack:any', 'skill:gitflow'],
    evidence: [{ project: 'example-project', ref: 'PR #2', date: '2026-08-31' }],
    retired_reason: null,
    body: 'A lesson stored in git.',
    ...over,
  }
}

let root: string, remoteDir: string, workDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-git-'))
  remoteDir = join(root, 'remote.git')
  workDir = join(root, 'work')

  await simpleGit().init(['--bare', remoteDir])
  const g = simpleGit()
  await g.clone(remoteDir, workDir)
  const w = simpleGit(workDir)
  await w.addConfig('user.email', 'test@test')
  await w.addConfig('user.name', 'test')
  await w.commit('init', [], { '--allow-empty': null })
  await w.push('origin', 'HEAD:refs/heads/main')
  await w.raw(['branch', '--set-upstream-to=origin/main'])
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('GitStore', () => {
  it('commits a written lesson with the lessons: prefix', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson())

    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/^lessons:/)
    expect(await store.read('git-lesson')).toEqual(lesson())
  })

  it('pushes to the remote so another clone sees the lesson', async () => {
    const a = new GitStore(workDir, 'lessons', remoteDir)
    await a.write(lesson())

    const otherDir = join(root, 'other')
    await simpleGit().clone(remoteDir, otherDir)
    const b = new GitStore(otherDir, 'lessons', remoteDir)

    expect((await b.read('git-lesson'))?.id).toBe('git-lesson')
  })

  it('retire commits with a message naming the reason', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson())
    await store.retire('git-lesson', 'no longer true after the v2 rewrite')

    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/retire/)
    expect((await store.read('git-lesson'))?.status).toBe('retired')
  })

  it('list delegates tag filtering to the local backend', async () => {
    const store = new GitStore(workDir, 'lessons')
    await store.write(lesson({ id: 'a', tags: ['skill:backend'] }))
    await store.write(lesson({ id: 'b', tags: ['skill:database'] }))
    expect((await store.list(['skill:database'])).map(l => l.id)).toEqual(['b'])
  })
})

describe('createStore', () => {
  it('builds a local backend from config', async () => {
    const store = createStore({ backend: 'local', path: join(root, 'plain') })
    await store.write(lesson())
    expect((await store.read('git-lesson'))?.id).toBe('git-lesson')
  })

  it('builds a git backend from config', async () => {
    const store = createStore({ backend: 'git', path: workDir, subdir: 'lessons' })
    await store.write(lesson())
    const log = await simpleGit(workDir).log()
    expect(log.latest?.message).toMatch(/^lessons:/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-git.test.ts`
Expected: FAIL — cannot resolve `../src/store/git.js`

- [ ] **Step 3: Write src/store/git.ts**

```typescript
import { join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { LocalStore } from './local.js'
import type { LessonStore } from './types.js'
import type { Lesson } from '../lesson.js'

/**
 * Wraps LocalStore with git sync: pull before a read so the library is current,
 * commit and push after a write so other machines see it. Push failures are
 * surfaced, never swallowed — a silently unpushed lesson is a lesson lost.
 */
export class GitStore implements LessonStore {
  private readonly git: SimpleGit
  private readonly local: LocalStore

  constructor(
    private readonly repoDir: string,
    subdir: string,
    private readonly remote?: string,
  ) {
    this.git = simpleGit(repoDir)
    this.local = new LocalStore(join(repoDir, subdir))
  }

  private async pull(): Promise<void> {
    if (!this.remote) return
    try {
      await this.git.pull()
    } catch (e) {
      throw new Error(
        `could not pull the lesson library — resolve this before writing, or the ` +
        `next push will conflict: ${(e as Error).message}`,
      )
    }
  }

  private async commit(message: string): Promise<void> {
    await this.git.add('.')
    const status = await this.git.status()
    if (status.staged.length === 0) return
    await this.git.commit(message)
    if (this.remote) await this.git.push()
  }

  async list(tags?: string[]): Promise<Lesson[]> {
    await this.pull()
    return this.local.list(tags)
  }

  async read(id: string): Promise<Lesson | null> {
    await this.pull()
    return this.local.read(id)
  }

  async write(lesson: Lesson): Promise<void> {
    await this.pull()
    await this.local.write(lesson)
    const stored = await this.local.read(lesson.id)
    await this.commit(`lessons: ${stored?.status === 'confirmed' ? 'confirm' : 'add'} ${lesson.id}`)
  }

  async retire(id: string, reason: string): Promise<void> {
    await this.pull()
    await this.local.retire(id, reason)
    await this.commit(`lessons: retire ${id}\n\n${reason}`)
  }
}
```

- [ ] **Step 4: Write src/store/index.ts**

```typescript
import { LocalStore } from './local.js'
import { GitStore } from './git.js'
import type { LessonStore, StoreConfig } from './types.js'

export type { LessonStore, StoreConfig } from './types.js'
export { LocalStore } from './local.js'
export { GitStore } from './git.js'

export function createStore(config: StoreConfig): LessonStore {
  switch (config.backend) {
    case 'local':
      return new LocalStore(config.path)
    case 'git':
      return new GitStore(config.path, config.subdir ?? 'lessons', config.remote)
    default:
      throw new Error(`unknown store backend: ${String((config as StoreConfig).backend)}`)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/store-git.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/store/git.ts src/store/index.ts tests/store-git.test.ts
git commit -m "feat(store): add the git backend and store factory

Pull before read, commit and push after write. A failed push raises rather
than passing silently — an unpushed lesson is invisible to every other
project, which is the one failure this store exists to prevent."
```

---

## Task 4: Config and gate state

**Files:**
- Create: `src/config.ts`, `src/state.ts`
- Test: `tests/config.test.ts`, `tests/state.test.ts`

**Interfaces:**
- Consumes: `StoreConfig` from `src/store/types.ts`
- Produces: `loadConfig(home?: string): Promise<ForgeConfig>`, `DEFAULT_CONFIG`; `readState(projectDir: string): Promise<ForgeState | null>`, `writeState(projectDir: string, state: ForgeState): Promise<void>`, `assertPhaseAllowed(state: ForgeState | null, phase: Phase): void` (throws `PhaseGateError`)

```typescript
export type Phase = 'scope' | 'architecture' | 'build'
export type SizeClass = 'throwaway' | 'tool' | 'product'

export interface Escalation {
  from: Phase
  owner: Phase
  conflict: string
  proposal: string
  raised: string        // ISO timestamp
}

export interface ForgeState {
  phase: Phase
  sizeClass: SizeClass | null
  approvals: Partial<Record<Phase, string | null>>
  escalation: Escalation | null
}
```

- [ ] **Step 1: Write the failing config test**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'forge-home-')) })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('loadConfig', () => {
  it('returns the local-backend default when no config file exists', async () => {
    expect(await loadConfig(home)).toEqual(DEFAULT_CONFIG)
  })

  it('reads a git-backend config from ~/.claude/forge/config.json', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'git', path: '~/.claude/forge/lessons',
               remote: 'git@github.com:<owner>/forge-lessons.git', subdir: 'lessons' },
    }))
    const cfg = await loadConfig(home)
    expect(cfg.store.backend).toBe('git')
    expect(cfg.store.subdir).toBe('lessons')
  })

  it('expands a leading ~ in the store path', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'local', path: '~/lessons-here' },
    }))
    const cfg = await loadConfig(home)
    expect(cfg.store.path).toBe(join(home, 'lessons-here'))
    expect(cfg.store.path).not.toContain('~')
  })

  it('rejects an unknown backend rather than falling back silently', async () => {
    const dir = join(home, '.claude', 'forge')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      store: { backend: 'ftp', path: '/tmp/x' },
    }))
    await expect(loadConfig(home)).rejects.toThrow(/backend/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`

- [ ] **Step 3: Write src/config.ts**

```typescript
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'
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
```

- [ ] **Step 4: Run config tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Write the failing state test**

Create `tests/state.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/state.test.ts`
Expected: FAIL — cannot resolve `../src/state.js`

- [ ] **Step 7: Write src/state.ts**

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export type Phase = 'scope' | 'architecture' | 'build'
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
 * The gate. Scope always runs. Architecture needs an approved scope. Build needs
 * an approved architecture, except for a throwaway, which skips architecture
 * entirely. An open escalation blocks everything — the project is parked on a
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
  }
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — lesson (7), store-local (9), store-git (6), config (4), state (7) = 33 tests

- [ ] **Step 9: Commit**

```bash
git add src/config.ts src/state.ts tests/config.test.ts tests/state.test.ts
git commit -m "feat(state): add config loading and the phase gate

Gate state is a file in the target project so it survives /clear and session
end. An open escalation blocks every phase — a parked project must read as
parked, not as merely unfinished."
```

---

## Task 5: Plugin manifest and the store/lessons skills

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `skills/forge-store/SKILL.md`, `skills/forge-lessons/SKILL.md`
- Create: `commands/lessons.md`
- Test: manual — install the plugin and confirm the skills list

**Interfaces:**
- Consumes: `createStore`, `loadConfig` from Tasks 3–4
- Produces: the `/forge:lessons` command surface — `import <path>`, `purge --project`, `purge --library --tag <t>`, `retire <id> --reason "<why>"`, `list [--tag <t>]`

- [ ] **Step 1: Write .claude-plugin/plugin.json**

```json
{
  "name": "forge",
  "version": "0.1.0",
  "description": "Drives a project from scope through architecture into development, generating project skills and accumulating portable lessons across every project it touches.",
  "author": "andrcami"
}
```

- [ ] **Step 2: Write skills/forge-store/SKILL.md**

```markdown
---
name: forge-store
description: The lesson store interface — how Forge reads and writes the portable lesson library. Use when a skill needs to list, read, write, or retire lessons, or when diagnosing store configuration.
---

# Lesson store

Four operations, three backends. Every other Forge skill goes through this
surface rather than touching lesson files directly.

## Operations

- `list(tags?)` — all portable lessons, or those carrying **every** requested tag
- `read(id)` — one lesson, or `null`
- `write(lesson)` — validate, merge, persist. A second independent sighting
  promotes `observed` to `confirmed` and appends its evidence
- `retire(id, reason)` — set `status: retired` and record why. The entry stays

## Backends

| Backend | Use | Behavior |
|---|---|---|
| `local` | single machine, no sharing | plain directory |
| `git` | the default for real use | pull before read, commit + push after write |
| adapter seam | future HTTP/DB | interface defined, not built |

Configuration lives at `~/.claude/forge/config.json`:

```json
{ "store": { "backend": "git",
             "path": "~/.claude/forge/lessons",
             "remote": "git@github.com:<owner>/forge-lessons.git",
             "subdir": "lessons" } }
```

With no config file, the store runs `local` at `~/.claude/forge/lessons`.

## Rules

- **Only `scope: portable` lessons enter the library.** A `scope: project` lesson
  belongs in that repo's `.claude/skills/*/SKILL.md` under `## Lessons`. The store
  rejects a project-scoped write rather than storing it in the wrong place.
- **A failed push is an error, never a warning.** A lesson that committed locally
  but never pushed is invisible to every other project — the one failure this
  store exists to prevent.
- **Lesson commits are prefixed `lessons:`** so `git log -- lessons/` reads clean
  alongside plugin releases.
- **Validation happens at write, not at load.** A malformed lesson never enters
  the library, so no reader has to defend against one.
```

- [ ] **Step 3: Write skills/forge-lessons/SKILL.md**

```markdown
---
name: forge-lessons
description: Read, import, promote, retire, and purge lessons in the Forge library. Use when backfilling lessons from an existing repo, reviewing what the library holds, retiring a lesson that turned out wrong, or clearing project lessons.
---

# Lesson library

The library holds **portable** lessons — those that would bite the next project
regardless of stack, or that are tagged to the stack they apply to. Project-specific
lessons stay in their own repo.

## The two axes

A lesson carries two independent classifications. Conflating them is the mistake
this design exists to avoid.

- **`scope:`** — `project` or `portable`. Decides **where it is stored**.
- **`tags:`** — `stack:go`, `skill:database`, `domain:webhooks`, `platform:windows`.
  Decides **when it loads**.

Every portable lesson carries a `skill:` tag naming the concern skill it belongs
to. That tag is what routes a lesson into the right generated skill in the next
project.

## Load rules

- `confirmed` matching tags load **as rules**
- `observed` load **as suggestions**, flagged as such
- `retired` load only when something proposes re-adding the same lesson, and
  surface as "tried this, did not hold, here is why"

The retired tier is what stops the same wrong idea being relearned. It is the
half of the library that records what does **not** work.

## Commands

### `import <path>`

Read an existing repo's `.claude/skills/**` and propose portable candidates.
For each: show the lesson, the proposed tags, and the proposed status. **Approve
per entry** — nothing is written unseen. A lesson that has demonstrably bitten
twice may enter as `confirmed`; everything else enters `observed`.

Filter out what is not portable: project-specific schema, design tokens, one-off
branch trivia. When unsure, leave it in the project — wrong-but-local beats
wrong-and-global.

### `list [--tag <t>]`

Show the library, grouped by status. `confirmed` first, `retired` last.

### `retire <id> --reason "<why>"`

**The preferred operation when a lesson turns out wrong.** The entry stays
visible with its reason, so the next session learns what was tried.

### `purge --project`

Clear `## Lessons` sections in the current repo's skills. The library is
untouched.

### `purge --library --tag <t>`

Tag-scoped library purge. Requires typed confirmation. Prefer `retire` — purging
discards the negative knowledge the library exists to keep. The library is a git
repo, so a purge is recoverable; say so when confirming rather than making it
sound irreversible.

## Rules

- **Nothing is written to the library without the user seeing it.** A library
  that writes itself unattended drifts.
- **Ambiguous scope defaults to `project`.**
- **Prune in the same pass as you write.** A lesson describing a since-closed
  state is worse than no lesson.
```

- [ ] **Step 4: Write commands/lessons.md**

```markdown
---
description: Read, import, promote, retire, or purge Forge lessons
---

Invoke the `forge-lessons` skill and carry out: $ARGUMENTS

If no arguments were given, list the library grouped by status.
```

- [ ] **Step 5: Verify the plugin loads**

```bash
ls .claude-plugin/plugin.json skills/forge-store/SKILL.md skills/forge-lessons/SKILL.md commands/lessons.md
npx vitest run
```

Expected: all four files present, 33 tests still passing.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin commands/lessons.md skills/forge-store skills/forge-lessons
git commit -m "feat(plugin): add the manifest and the store and lessons skills

The two-axis model is stated in the skill itself: scope decides where a lesson
is stored, tags decide when it loads. Retire is documented as preferred over
purge because the record of what failed is the half most easily lost."
```

---

## Task 6: Harvest skill and the initial backfill

**Files:**
- Create: `skills/forge-harvest/SKILL.md`, `commands/harvest.md`
- Seed: the lesson library, via `import`
- Test: manual — `list` shows the imported lessons, tag filtering returns the expected subsets

**Interfaces:**
- Consumes: the store and `forge-lessons` skill from Task 5
- Produces: the populated library that Task 8's architecture phase reads

- [ ] **Step 1: Write skills/forge-harvest/SKILL.md**

```markdown
---
name: forge-harvest
description: Fold a finished branch's lessons back into the owning skill, and portable ones into the shared library. Use before opening any PR.
---

# Harvest

Run **before the PR opens**. One pass, folding what this branch taught back into
the skills so the next session starts ahead.

Diff the branch's work and the `docs/context/status.md` deltas against the
relevant skills. For each candidate lesson, four questions in order:

## 1. Is it durable and general?

Would it bite the next unrelated feature? If it is one-off branch trivia, stop —
writing it costs more than it saves.

A recorded gap that is not fixed yet belongs in `status.md`, not a skill. Skills
hold standing rules, not open TODOs.

## 2. Which skill owns it?

A DB gotcha to `database`, a router constraint to `frontend`, an orchestration
pattern to `gitflow`. Add a terse line with a one-clause source (`PR #22`).

## 3. Is it portable, or project-specific?

- **Project** — stays in this repo's `.claude/skills/<owner>/SKILL.md` under
  `## Lessons`. Schema details, design tokens, this product's rules.
- **Portable** — becomes a library candidate. Provider behavior, language
  semantics, tooling traps, security patterns.

Ambiguous defaults to **project**.

## 4. Prune in the same pass

Remove skill lines describing a state that has since closed. A stale line is
worse than no line.

## Writing to the library

Portable candidates are **shown for approval before write, never written
silently**. For each: the lesson text, proposed tags (including the `skill:` tag
that routes it), and proposed status.

A new lesson enters `observed`. If it matches an existing lesson's id, the write
appends evidence and promotes it to `confirmed` — the second independent sighting
is what earns rule status.

## Rules

- Harvest runs before the PR, not after. A lesson deferred is a lesson lost.
- Never write a library lesson the user has not seen.
- The library is not a diary. If you cannot state the lesson as a rule someone
  could follow, it is not ready to be written.
```

- [ ] **Step 2: Write commands/harvest.md**

```markdown
---
description: Fold this branch's lessons into the owning skills and the shared library
---

Invoke the `forge-harvest` skill for the current branch. $ARGUMENTS
```

- [ ] **Step 3: Seed the library**

Import the first portable lessons from the source project's skills with the
`lessons` skill's `import`, approving each entry. The seed lessons themselves
live in the private lesson library, not in this document.

- [ ] **Step 4: Verify the library reads back**

```bash
node --input-type=module -e "
import { LocalStore } from './src/store/local.js'
const s = new LocalStore('lessons')
const all = await s.list()
console.log('count:', all.length)
console.log('confirmed:', all.filter(l => l.status === 'confirmed').length)
console.log('security:', (await s.list(['domain:security'])).map(l => l.id))
console.log('gitflow:', (await s.list(['skill:gitflow'])).map(l => l.id))
"
```

Expected: the imported count, with each tag filter returning the matching subset.

- [ ] **Step 5: Commit**

```bash
git add skills/forge-harvest commands/harvest.md lessons/
git commit -m "feat(harvest): add the harvest skill and seed the library

Portable lessons imported from the source project's skills — the framework's
first data source. Lessons that demonstrably bit more than once enter
confirmed; the rest enter observed pending a second sighting."
```

---

## Task 7: Scope phase

**Files:**
- Create: `skills/forge-scope/SKILL.md`, `commands/scope.md`
- Create: `references/templates/scope.md`
- Test: manual — run `/forge:scope` in an empty directory, confirm state and doc

**Interfaces:**
- Consumes: `readState`, `writeState`, `assertPhaseAllowed` from Task 4
- Produces: `docs/forge/scope.md` and a `state.json` with `sizeClass` set and `approvals.scope` stamped

- [ ] **Step 1: Write references/templates/scope.md**

```markdown
# Scope — <project name>

**Date:** <YYYY-MM-DD>
**Size class:** <throwaway | tool | product>

## Problem

<What is broken or missing, stated without reference to a solution.>

## Users

<Who uses this, and what each of them is trying to get done.>

## Core flows

<The three to seven paths that must work for this to be worth building.>

## Non-goals

<What this deliberately does not do. Load-bearing: the architecture phase uses
these to reject candidates that win only on capabilities you do not want.>

## Success criteria

<How you will know it worked. Observable, not aspirational.>

## Constraints

- **Budget:**
- **Team:**
- **Deadline:**
- **Compliance / regulated data:**
- **Systems that must be integrated:**
```

- [ ] **Step 2: Write skills/forge-scope/SKILL.md**

```markdown
---
name: forge-scope
description: Phase 1 of Forge — interview the user to capture product scope, classify project size, and write the scope document. Use at the start of a new project, before any architecture or implementation work.
---

# Phase 1 — Scope

Capture what is being built and how much ceremony it warrants. Nothing is
designed here and nothing is built.

## Before starting

Read `docs/forge/state.json` if it exists. Scope may always run — but if a scope
is already approved, say so and ask whether this is a revision before overwriting.

## The interview

**One question at a time.** Multiple choice where the option set is closed, open
where it is not. Do not batch questions into a form — the answers to early
questions change which later questions matter.

Cover, in roughly this order:

1. **The problem** — what is broken or missing, stated without a solution in it
2. **Users** — who they are, what each is trying to get done
3. **Core flows** — the three to seven paths that must work
4. **Non-goals** — what this deliberately does not do
5. **Success criteria** — observable, not aspirational
6. **Constraints** — budget, team size and fluency, deadline, compliance, systems
   that must be integrated

Stop asking once the answers stop changing what would be built.

## Non-goals are load-bearing

The scope document's most valuable section at month three is the list of what you
decided not to build. The architecture phase uses it to reject candidates that
win only on capabilities this project does not want. Push for real non-goals —
"we are not doing realtime", "no mobile app", "single tenant only" — not polite
disclaimers.

## Size classification

Propose a class from the interview; the user confirms. This is the ceremony dial
for every later phase.

| Class | Means | Architecture phase | QA gates |
|---|---|---|---|
| `throwaway` | script, spike, one-off | skipped | none |
| `tool` | single-purpose, one or few users | short — stack named + rationale | typecheck + test + build |
| `product` | multi-user, real data, will live | full — discriminators, 3 candidates, decision doc | full gates + review agents |

A wrong guess costs one correction, so guess rather than asking cold.

## Output

Write `docs/forge/scope.md` from `references/templates/scope.md`.

Then present it and **ask for explicit approval**. On approval, write
`docs/forge/state.json`:

```json
{
  "phase": "scope",
  "sizeClass": "<class>",
  "approvals": { "scope": "<ISO timestamp>" },
  "escalation": null
}
```

Do not stamp the approval until the user has actually approved. The gate is the
approval, not the document.

## Next

- `throwaway` → `/forge:build` (architecture is skipped)
- `tool` or `product` → `/forge:architect`

State which, and stop.
```

- [ ] **Step 3: Write commands/scope.md**

```markdown
---
description: Capture product scope and classify project size (Forge phase 1)
---

Invoke the `forge-scope` skill. $ARGUMENTS
```

- [ ] **Step 4: Verify against the gate**

```bash
npx vitest run tests/state.test.ts
```

Expected: PASS — the gate logic the skill depends on is already covered.

- [ ] **Step 5: Commit**

```bash
git add skills/forge-scope commands/scope.md references/templates/scope.md
git commit -m "feat(scope): add the scope phase skill and template

Size classification is the ceremony dial: a throwaway skips architecture
entirely, a product gets the full comparison. One question at a time, because
early answers change which later questions matter."
```

---

## Task 8: Architecture phase

**Files:**
- Create: `skills/forge-architect/SKILL.md`, `commands/architect.md`
- Create: `references/discriminators.md`
- Create: `references/stacks/*.md` — one per archetype
- Create: `references/templates/architecture.md`
- Test: manual — run against a sample scope, confirm three candidates and a decision doc

**Interfaces:**
- Consumes: `assertPhaseAllowed` (Task 4), the store's `list(tags)` for `stack:*` / `arch:*` lessons (Task 3)
- Produces: `docs/forge/architecture.md`, `approvals.architecture` stamped, `docs/context/decisions.md` seeded

- [ ] **Step 1: Write references/discriminators.md**

```markdown
# Discriminators — the questions that separate stacks

Ask only those the scope leaves open. Each entry states what the answer rules in
or out, so a question with no discriminating power is skipped.

## Concurrency shape

Request/response, long-lived connections, or fan-out?

- **Request/response** — every stack qualifies; this discriminates nothing on its
  own, so move on quickly
- **Long-lived connections** (websockets, SSE at scale) — favours Elixir, Go,
  Rust; penalises PHP and short-lived-process models
- **Fan-out** (one event, many recipients) — strongly favours Elixir/OTP or Go
  with a broker; a thread-per-connection model becomes the bottleneck

## Latency budget

A floor or an average? A p99 requirement is a different constraint from a mean.

- **Hard floor under 10ms** — Rust, Go, C++; rules out GC-pause-sensitive stacks
  at the tail
- **Sub-second average** — nearly everything qualifies
- **Human-scale (seconds)** — latency is not discriminating; optimise for team
  velocity instead

## Data model

Relational, document, graph, time-series, or blob-heavy?

- **Relational with real invariants** — Postgres, and prefer a stack with a mature
  migration story
- **Time-series at volume** — ClickHouse, TimescaleDB; a general RDBMS will hurt
- **Graph traversal central** — Neo4j or a graph extension; a self-join chain in
  SQL is a warning sign
- **Blob-heavy** — object storage plus a metadata DB; do not put blobs in the RDBMS

## Scale band, and plausible peak

Ask both. They are different questions and the gap between them is the design.

- Steady-state RPS or concurrent users
- Plausible peak — a launch, a seasonal spike, a viral moment
- A 100× gap between them means autoscaling or queueing is architectural, not an
  optimisation

## Team

Size, and existing language fluency.

- **Solo or pair** — team fluency dominates every other consideration. A stack the
  team knows beats a theoretically better one they do not
- **No ops capacity** — rules out anything needing cluster management; favours
  managed Postgres and a single deployable

## Regulated or PII data

- **Regulated** (health, financial, minors) — audit trail and retention become
  architectural; favours stacks with mature audit tooling
- **PII at all** — data residency may constrain hosting before it constrains stack

## Realtime, offline, mobile

- **Realtime UI** — favours Phoenix LiveView, or a stack with a first-class
  websocket story
- **Offline-capable client** — sync and conflict resolution are the hard part;
  this is a data-model decision, not a stack one
- **Mobile clients** — API-first; rules out server-rendered-only designs

## ML in the request path

- **Yes** — Python in the serving path, or a service boundary to it. Do not
  contort the whole stack around it; isolate it
- **Batch only** — not discriminating; run it out of band

## Deploy constraints

VPS, serverless, on-prem, air-gapped?

- **Air-gapped or on-prem** — rules out managed-service-dependent designs
- **Serverless** — penalises long-lived connections and warm in-process state
- **Single VPS** — favours one deployable and an embedded or co-located DB
```

- [ ] **Step 2: Write the stack reference files**

Create one file per archetype under `references/stacks/`. Each states fit,
anti-fit, failure modes, and scale band. Write these six to start:
`go-postgres.md`, `elixir-phoenix.md`, `rust-axum.md`, `django-postgres.md`,
`nextjs-postgres.md`, `sqlite-single-node.md`.

Use this shape for each — `references/stacks/go-postgres.md` in full as the
worked example:

```markdown
# Go + Postgres

**Scale band:** hundreds to tens of thousands of RPS on modest hardware.

## Fits

- High-throughput CRUD and API work where per-request cost matters
- Long-lived connections — goroutines make websockets cheap
- Teams that value a small language surface and fast onboarding
- Single static binary deploys; no runtime to install

## Loses

- Rich domain modelling — no sum types, no generics-heavy abstractions without
  friction. Complex invariants become verbose
- Rapid CRUD scaffolding — there is no Rails or Django admin equivalent; expect
  to write more by hand
- Teams with no Go fluency and a tight deadline; the language is small but the
  ecosystem conventions are not obvious

## Failure modes at 10× scale

- Connection pool exhaustion before CPU saturates — size the pool against
  Postgres `max_connections`, not against goroutine count
- `context` cancellation not plumbed through, so load sheds badly under pressure
- N+1 queries hide well because each is fast; they surface as a cliff, not a slope

## Ops burden

Low. Static binary, no runtime, straightforward containerisation. Postgres is the
only stateful component.
```

Write the remaining five to the same shape, each with a real "Loses" section.
A catalog of features is marketing; a catalog of failure modes is useful.

- [ ] **Step 3: Write references/templates/architecture.md**

```markdown
# Architecture — <project name>

**Date:** <YYYY-MM-DD>
**Scope:** `docs/forge/scope.md`
**Size class:** <tool | product>

## Discriminating answers

<The discriminator answers that drove the decision. One line each.>

## Chosen stack

<Stack, and why it wins for these answers specifically.>

## Rejected candidates

| Candidate | Why it lost |
|---|---|
| <stack> | <the specific constraint it failed, not a general preference> |
| <stack> | <same> |

## Module boundaries

<The modules, and what each owns. Name the contracts between them.>

## Data model sketch

<Core entities and their relationships. Not a schema — a sketch.>

## Binding decisions

<The decisions that become standing rules in the generated skills. Each becomes
a line in the project's decision registry.>

## Known risks

<What could force a revision, and the earliest signal you would see.>
```

- [ ] **Step 4: Write skills/forge-architect/SKILL.md**

```markdown
---
name: forge-architect
description: Phase 2 of Forge — explore stack candidates from the scope's discriminating answers, compare trade-offs, and record the architecture decision. Use after scope is approved, before any implementation.
---

# Phase 2 — Architecture

Runs for `tool` and `product`. A `throwaway` skips this phase entirely.

## Before starting

Read `docs/forge/state.json`. **Refuse to run if the scope is unapproved** or an
escalation is open — say which, and what would unblock it.

Read `docs/forge/scope.md` in full. The non-goals matter as much as the goals.

## Step 1 — Discriminators

Read `references/discriminators.md`. Ask only the questions the scope leaves
open, one at a time. A question whose answer would not change any candidate is a
question worth skipping.

Ask for the scale band **and** the plausible peak separately. The gap between
them is often the design.

## Step 2 — Candidates

Produce **three**, reasoned from the answers first, then checked against
`references/stacks/`. The catalog is evidence, not a verdict — never pick a stack
because it has a file.

Load library lessons tagged `stack:*` or `arch:*` before comparing. A `confirmed`
lesson is a prior project reporting what actually hurt; an `observed` one is a
suggestion. Say which informed a trade-off.

Each candidate states:

- **Fit** — why it suits these answers
- **Where it loses** — the real cost, not a token caveat
- **Failure modes at 10× the stated scale**
- **Team-fluency cost**
- **Ops burden**

In play without prejudice: Go, Elixir/Phoenix, Rust, Django, Rails, .NET,
Java/Spring, SQLite/LiteFS, Postgres, ClickHouse, NATS, Deno, Next.js, and plain
server-rendered anything. **Next.js, Python, and Postgres compete on merit and are
rejected as readily as any other candidate** — a default is not a decision.

Lead with a recommendation and the reasoning. Do not present three options and
ask the user to choose blind.

## Step 3 — Decision

Write `docs/forge/architecture.md` from `references/templates/architecture.md`.
Record why the winner won **and why each loser lost** — the rejection reasons are
what stop the question being reopened every month.

Seed `docs/context/decisions.md` with the binding decisions.

Present it and **ask for explicit approval**. On approval, stamp
`approvals.architecture` in `state.json`.

## Escalation — sending work backward

Any of these stops the phase. Name the conflict out loud; never absorb it
silently.

- The scope contradicts itself — two requirements cannot both hold
- No candidate survives the constraints — budget, scale, and team do not admit a
  stack
- Scale answers imply an architecture the budget or team cannot operate
- A later discovery contradicts a settled architecture decision

On trigger: stop, state the conflict concretely, name the phase that owns it,
propose the smallest change that resolves it, and wait. Write the escalation to
`state.json` so a resumed session sees the project is parked on a conflict rather
than merely unfinished.

A recorded architecture revision is strong lesson material — harvest it.

## Next

`/forge:build`. State that, and stop.
```

- [ ] **Step 5: Write commands/architect.md**

```markdown
---
description: Explore stack candidates and record the architecture decision (Forge phase 2)
---

Invoke the `forge-architect` skill. $ARGUMENTS
```

- [ ] **Step 6: Verify the references resolve**

```bash
ls references/stacks/ | wc -l   # expect 6
npx vitest run
```

Expected: six stack files, 33 tests passing.

- [ ] **Step 7: Commit**

```bash
git add skills/forge-architect commands/architect.md references/discriminators.md references/stacks references/templates/architecture.md
git commit -m "feat(architect): add the architecture phase, discriminators, and stack catalog

Candidates are reasoned from discriminating answers first and checked against
the catalog second, so a stack is never chosen because it has a file. Each
catalog entry states where the stack loses and how it fails at 10x scale — a
catalog of features would be marketing."
```

---

## Task 9: Build phase and generated templates

**Files:**
- Create: `skills/forge-build/SKILL.md`, `commands/build.md`
- Create: `references/templates/skill.md`, `references/templates/claude-md.md`, `references/templates/gitflow-skill.md`, `references/templates/context/*`
- Test: manual — run against a sample architecture, confirm the right concern skills are generated

**Interfaces:**
- Consumes: `assertPhaseAllowed` (Task 4), the store's `list(['skill:<name>'])` (Task 3), `docs/forge/architecture.md` (Task 8)
- Produces: a scaffolded project — `.claude/skills/**`, `docs/context/**`, `CLAUDE.md`, repo bones

- [ ] **Step 1: Write references/templates/skill.md**

```markdown
---
name: <concern>
description: <Concern> standard for <project> — <the two or three things this skill governs>. Use for <the work that should load it>.
---

# <Concern> standard

Settled by the architecture decision (`docs/forge/architecture.md`). Do not
re-litigate these in code.

## Binding rules

<The architecture decisions this skill enforces. Each states the rule, not the
rationale — the rationale lives in the architecture doc.>

## Boundaries

<What this concern owns, and the contracts at its edges.>

## Commands

<The exact commands for this stack. Filled from the architecture decision.>

## Reference

<Link to the Forge stack reference for generic know-how. Do not inline it —
a linked reference stays current, an inlined one rots.>

## Lessons

<!-- Filled by forge-harvest. Each line: the rule, then a one-clause source.
     Prune stale lines in the same pass as you add new ones. -->
```

- [ ] **Step 2: Write references/templates/claude-md.md**

```markdown
# CLAUDE.md — <project>

<One-paragraph description of what this is, from the scope doc.>

## Session start

1. Read `docs/context/status.md` — current state, in-flight work, next steps.
2. Skim the skills index below and load those matching this session's work.
3. For anything architectural, `docs/forge/architecture.md` is binding.

## Skills index (`.claude/skills/`)

| Skill | Use for |
|---|---|
<!-- One row per generated concern skill. -->

## Commands

```bash
<!-- The exact commands for this stack. -->
```

## Authority order (when documents disagree)

1. **`docs/forge/architecture.md`** — the binding architecture decision
2. **`docs/context/decisions.md`** — decisions made since
3. **`docs/forge/scope.md`** — what is and is not being built

## Non-negotiable rules

<!-- Carried from the architecture decision's binding decisions. -->

## Session end

Update `docs/context/status.md` in the same PR as the work. Run the harvest
(`/forge:harvest`) before opening the PR.
```

- [ ] **Step 3: Write references/templates/gitflow-skill.md**

The generated gitflow skill carries the QA gates. Scale by size class.

```markdown
---
name: gitflow
description: Branching, PR, and release procedure for this repo. Use whenever creating a branch, opening a PR, releasing, or hotfixing.
---

# Git flow

<Branch model from the architecture decision.>

## Feature work

```bash
git fetch origin <integration-branch>
git checkout -b feature/<slug> origin/<integration-branch>
# ...work, commit...
<typecheck command> && <build command> && <test command>
git push -u origin feature/<slug>
```

Open the PR with base `<integration-branch>`. Delete the branch after merge —
local and remote.

## Before the PR — gates

<!-- product: all of these. tool: the first three. throwaway: none. -->

1. **Local green** — `<typecheck>`, `<build>`, `<test>` all pass
2. **Harvest** — run `/forge:harvest` and fold this branch's lessons back
3. **Docs sweep** — user-facing docs, spec-vs-implementation drift, and anything
   contradicting a binding decision. The PR body names what was updated or states
   "no doc impact". Silence reads as "forgot"
4. **Memory** — `docs/context/status.md` updated in this same PR
5. **Review agents** — run `code-review` / `pr-review-toolkit` where available

## CI

<CI skeleton for this stack. The gates run in CI, not only locally.>

## Lessons

<!-- Filled by forge-harvest. -->
```

- [ ] **Step 4: Write skills/forge-build/SKILL.md**

```markdown
---
name: forge-build
description: Phase 3 of Forge — scaffold the project repo, generate its concern skills from the architecture decision, and hand off to implementation planning. Use after architecture is approved.
---

# Phase 3 — Build

Scaffold the repo and generate the skills that will govern it. No application
code is written here.

## Before starting

Read `docs/forge/state.json`. **Refuse to run** if the scope is unapproved, or if
the architecture is unapproved and the class is not `throwaway`. An open
escalation blocks everything.

Read `docs/forge/architecture.md` — it decides which skills exist.

## Which concern skills to generate

An output of the architecture decision, not a fixed list.

| Concern skill | Generated when | Wire when present |
|---|---|---|
| `backend` | server-side code exists | — |
| `database` | a persistent store was chosen | — |
| `frontend` | UI is in scope | — |
| `<design-system>` | UI is in scope | `frontend-design` |
| `devops` | deployed anywhere | — |
| `gitflow` | always | — |
| `context-memory` | always | — |
| domain skills | architecture names bounded contexts | — |

A Go API with no UI gets backend, database, devops, gitflow, context-memory — and
no frontend anything. Generate the design-system skill even when thin: it owns
tokens, component inventory, and the visual rules that drift without a file to
hold them.

`dataviz` and niche skills stay opt-in — suggest them when the scope mentions
charts or analytics, do not wire them by default.

## Generating a skill

From `references/templates/skill.md`. Each generated skill contains:

- The binding architecture decisions it enforces
- Its boundaries and contracts
- The exact commands for this stack
- A **link** to the Forge stack reference for generic know-how — never inline it
- An empty `## Lessons` section

Then **load library lessons tagged `skill:<concern>`** and seed the Lessons
section: `confirmed` as rules, `observed` as suggestions marked as such. This is
the point where a new project inherits what every prior project learned.

Generated content reads normally. Caveman mode applies to conversation, never to
a generated `SKILL.md` or `CLAUDE.md`.

## Scaffolded structure

- `.claude/skills/` — the generated concern skills
- `docs/context/` — `status.md`, `decisions.md` seeded from the architecture doc,
  `README.md`
- `CLAUDE.md` — from `references/templates/claude-md.md`
- Repo bones — `git init`, the branch model, a CI skeleton for the chosen stack,
  test setup

## Optional skill detection

Detect, use when present, degrade when absent. **State which path you took.**

| Skill | Used for | Absent → |
|---|---|---|
| `superpowers` | planning, TDD, verification | terse built-in path |
| `caveman` | interaction token cost | normal prose |
| `context-mode` | reference reading | direct reads |
| `graphify` | codebase navigation, `product` only | omitted from generated CLAUDE.md |

## Handoff

Invoke `superpowers:writing-plans` when present, or a built-in plan path when
absent. Say which. That is the terminal step — do not start implementing.
```

- [ ] **Step 5: Write commands/build.md**

```markdown
---
description: Scaffold the repo and generate its skills from the architecture decision (Forge phase 3)
---

Invoke the `forge-build` skill. $ARGUMENTS
```

- [ ] **Step 6: Write the context templates**

Create `references/templates/context/status.md`:

```markdown
# Status

**Updated:** <YYYY-MM-DD>

## Current state

<What works today. A dashboard, not a journal — keep under ~60 lines.>

## In flight

<Work underway, with branch names.>

## Next

<Priority order.>

## Drift

<Where reality has diverged from a binding decision. Flag it here rather than
silently rewriting the decision.>
```

Create `references/templates/context/decisions.md`:

```markdown
# Decisions

Append one entry per decision made outside the architecture doc. Never rewrite
history — supersede an entry instead.

## <YYYY-MM-DD> — <decision>

**Decision:** <what was decided>
**Why:** <the reasoning>
**Alternatives rejected:** <what lost, and why>
```

Create `references/templates/context/README.md`:

```markdown
# Context memory

Any session — human or agent — should cold-start from these files without
replaying old conversations.

- `status.md` — current state, in flight, next. Rewritten, not appended.
- `decisions.md` — one entry per decision. Appended, never rewritten.

Memory updates ship in the same PR as the work they describe. Stale memory is
worse than no memory.
```

- [ ] **Step 7: Verify the full suite and the template set**

```bash
ls references/templates/          # skill.md claude-md.md gitflow-skill.md scope.md architecture.md context/
ls references/templates/context/  # status.md decisions.md README.md
npx vitest run
npx tsc --noEmit
```

Expected: all templates present, 33 tests passing, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add skills/forge-build commands/build.md references/templates
git commit -m "feat(build): add the build phase and generation templates

Which concern skills exist is an output of the architecture decision, not a
fixed list. Generation seeds each skill's Lessons section from library lessons
tagged skill:<concern> — the point where a new project inherits what every
prior project learned."
```

---

## Task 10: README, install, and first end-to-end run

**Files:**
- Create: `README.md`
- Modify: `package.json` — add a `verify` script
- Test: end-to-end, both a `throwaway` and a `product` path

**Interfaces:**
- Consumes: everything
- Produces: an installable, documented plugin

- [ ] **Step 1: Write README.md**

```markdown
# Forge

A Claude Code plugin that drives a project from scope through architecture into
development — and accumulates what it learns across every project it touches.

**This repo is private and must stay private.** `lessons/` holds real security
findings and provider quirks harvested from working codebases.

## Phases

| Command | Phase | Output |
|---|---|---|
| `/forge:scope` | 1 — Scope | `docs/forge/scope.md`, size classification |
| `/forge:architect` | 2 — Architecture | `docs/forge/architecture.md`, stack decision |
| `/forge:build` | 3 — Build | generated skills, `docs/context/`, `CLAUDE.md` |
| `/forge:harvest` | ongoing | lessons folded back into skills and the library |
| `/forge:lessons` | ongoing | import, list, retire, purge |

Ceremony scales with the size class set in phase 1: a `throwaway` skips
architecture entirely; a `product` gets the full comparison and the full gate list.

Phases gate forward and escalate backward. A discovered contradiction sends work
back to the phase that owns it rather than being worked around.

## The lesson library

Lessons carry two independent classifications:

- **`scope:`** — `project` (stays in that repo) or `portable` (enters the library)
- **`tags:`** — `stack:go`, `skill:database`, `domain:webhooks`, `platform:windows`

`confirmed` lessons load as rules, `observed` as suggestions, `retired` only when
something proposes re-adding them — which is how the library records what does
**not** work.

## Install

```bash
git clone git@github.com:<owner>/forge-lessons.git ~/.claude/plugins/forge
cd ~/.claude/plugins/forge && npm install
```

Configure the store at `~/.claude/forge/config.json`:

```json
{ "store": { "backend": "git",
             "path": "~/.claude/plugins/forge",
             "remote": "git@github.com:<owner>/forge-lessons.git",
             "subdir": "lessons" } }
```

Omit the config entirely to run local-only at `~/.claude/forge/lessons`.

## Development

```bash
npm test        # vitest
npm run verify  # typecheck + test
```

## Design

`docs/superpowers/specs/2026-08-31-forge-framework-design.md`
```

- [ ] **Step 2: Add the verify script**

```bash
npm pkg set scripts.verify="tsc --noEmit && vitest run"
```

- [ ] **Step 3: Run the full verification**

```bash
npm run verify
```

Expected: typecheck clean, 33 tests passing.

- [ ] **Step 4: End-to-end throwaway path**

In a scratch directory, run `/forge:scope`, answer as a throwaway script, and
confirm:

- `docs/forge/scope.md` is written
- `state.json` has `sizeClass: "throwaway"` and a stamped `approvals.scope`
- `/forge:architect` **refuses**, saying architecture is skipped for a throwaway
- `/forge:build` proceeds

- [ ] **Step 5: End-to-end product path**

In a second scratch directory, run `/forge:scope` answering as a multi-user
product, then:

- `/forge:build` **refuses** — architecture unapproved
- `/forge:architect` produces three candidates, each with a real "where it loses"
- Library lessons tagged `stack:*` appear in the comparison
- On approval, `/forge:build` generates the concern skills the architecture
  implies — and **no frontend skills** if the scope has no UI
- Generated skills' `## Lessons` sections carry library lessons tagged
  `skill:<concern>`, `confirmed` as rules and `observed` marked as suggestions

- [ ] **Step 6: Commit and push**

```bash
git add README.md package.json
git commit -m "docs: add the README and verify script

Documents the phase commands, the two-axis lesson model, and install. States
the private-repo constraint up front — lessons/ holds real security findings."
git push -u origin main
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: plugin layout → 1, 5;
gate state → 4; scope phase → 7; architecture phase incl. discriminators, stack
catalog, escalation → 8; build phase incl. the conditional concern-skill table
and QA gates → 9; two-axis model, three tiers, lesson format, store interface,
lifecycle, load rules, harvest, commands, backfill → 1–3, 5, 6; optional skill
detection → 9; testing → distributed across 1–4 and 10.

**Type consistency.** `Lesson`, `LessonStore`, `StoreConfig`, `ForgeState`,
`Phase`, `SizeClass`, `Escalation` are defined once and referenced by their exact
names in every later task. `createStore(config)`, `assertPhaseAllowed(state,
phase)`, `loadConfig(home?)` keep consistent signatures across tasks 3, 4, 7, 8,
and 9.

**Deferred deliberately.** The HTTP/DB adapter (spec: seam only, unbuilt) and the
remaining stack reference files beyond the initial six — the catalog is designed
to grow by reference edits, and six covers the archetypes the discriminators
actually separate.
