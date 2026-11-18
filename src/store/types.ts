import type { Lesson } from '../lesson.js'

export interface LessonStore {
  list(tags?: string[]): Promise<Lesson[]>
  read(id: string): Promise<Lesson | null>
  write(lesson: Lesson): Promise<void>
  retire(id: string, reason: string): Promise<void>
  /**
   * Folds `from` into `into`, in one change. `into`'s tags are the merged
   * lesson's tags. Returns the ids whose files were removed, and the source
   * tags that `into` left out.
   */
  merge(into: Lesson, from: string[]): Promise<MergeResult>
  /** Renames a tag on every lesson that carries it. Returns the ids changed. */
  retag(from: string, to: string): Promise<string[]>
}

export interface MergeResult { lesson: Lesson; removed: string[]; droppedTags: string[] }

export interface StoreConfig {
  backend: 'local' | 'git'
  path: string
  remote?: string
  subdir?: string
}
