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
