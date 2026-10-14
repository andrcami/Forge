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
