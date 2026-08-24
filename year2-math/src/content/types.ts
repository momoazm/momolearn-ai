export type Expression = 'happy' | 'excited' | 'sad' | 'thinking' | 'cheer'

export interface MascotProps {
  expression?: Expression
  className?: string
}

export type QuestionKind = 'mcq' | 'type-number' | 'match' | 'order' | 'tap-count'

export interface McqQuestion {
  kind: 'mcq'
  prompt: string
  visual?: VisualSpec
  choices: string[]
  answerIndex: number
  hint?: string
}

export interface TypeNumberQuestion {
  kind: 'type-number'
  prompt: string
  visual?: VisualSpec
  answer: number
  hint?: string
}

export interface MatchQuestion {
  kind: 'match'
  prompt: string
  pairs: { left: string; right: string }[]
  hint?: string
}

export interface OrderQuestion {
  kind: 'order'
  prompt: string
  items: string[]
  hint?: string
}

/** items in `order` are the CORRECT order; player sees them shuffled */
/** Player taps every cell matching `emoji`; correct iff tapped set == targets */
export interface TapCountQuestion {
  kind: 'tap-count'
  prompt: string
  target: number
  targetEmoji: string
  cells: string[]
  hint?: string
}

export type Question =
  | McqQuestion
  | TypeNumberQuestion
  | MatchQuestion
  | OrderQuestion
  | TapCountQuestion

export type VisualSpec =
  | { type: 'emoji-group'; emojis: string[] }
  | { type: 'ten-frames'; count: number }
  | { type: 'number-line'; from: number; to: number; mark: number }
  | { type: 'shapes'; shape: string; count: number }
  | { type: 'fraction'; slices: number; filled: number }
  | { type: 'clock'; hour: number; minute: number }

export interface IntroCard {
  mascotId: MascotId
  title: string
  body: string
}

export type MascotId = 'zippy' | 'dash' | 'pippa' | 'bolt' | 'sparky'

export interface LessonDef {
  id: string
  title: string
  objectiveCodes: string[]
  intro: IntroCard
  /** returns n questions, deterministic for (lessonId, attemptSeed) */
  generate: (n: number, seed: number) => Question[]
}

export interface UnitDef {
  id: string
  order: number
  title: string
  subtitle: string
  color: string
  icon: string
  lessons: LessonDef[]
  bossLessonIds: string[]
}

export const questionEmojiBank = [
  '🍎', '⭐', '🎈', '🚗', '🐝', '🍪', '🐟', '🌻', '🧩', '⚽',
]
