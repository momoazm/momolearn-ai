import { hashString, mulberry32, randInt } from '../content/rng'

export const LEAGUES = [
  'Bronze',
  'Silver',
  'Gold',
  'Sapphire',
  'Ruby',
  'Emerald',
  'Amethyst',
  'Diamond',
] as const

export type LeagueName = (typeof LEAGUES)[number]

export const LEAGUE_META: Record<LeagueName, { icon: string; color: string }> = {
  Bronze: { icon: '🥉', color: '#cd7f32' },
  Silver: { icon: '🥈', color: '#9ca3af' },
  Gold: { icon: '🥇', color: '#f59e0b' },
  Sapphire: { icon: '🔹', color: '#2563eb' },
  Ruby: { icon: '🔺', color: '#dc2626' },
  Emerald: { icon: '💚', color: '#059669' },
  Amethyst: { icon: '🟣', color: '#7c3aed' },
  Diamond: { icon: '💎', color: '#06b6d4' },
}

export const PROMOTION_ZONE = 3 // top 3 of 10 go up
export const DEMOTION_RANK = 9 // bottom 2 go down

const BOT_NAMES = [
  'RubyRacer', 'TurboTom', 'NiaNimbus', 'PixelPip', 'CometKai',
  'ZaraZoom', 'MiloMint', 'EchoElle', 'BounceBo', 'NovaNed',
  'SkySumi', 'DashDev', 'GigiGlow', 'OzzyOnyx', 'LunaLark',
]

/** Monday-based ISO week key, e.g. "2026-08-17" */
export function weekKey(d = new Date()): string {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7 // Mon=0..Sun=6
  date.setDate(date.getDate() - day)
  return date.toISOString().slice(0, 10)
}

export function nextWeekKey(k: string): string {
  const d = new Date(k + 'T00:00:00')
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export interface BotRow {
  name: string
  xp: number
  isYou?: boolean
}

/**
 * Deterministic weekly bot leaderboard: same board all week,
 * changes every week, no backend needed.
 */
export function botBoard(week: string, userXp: number, count = 9): BotRow[] {
  const rand = mulberry32(hashString('league|' + week))
  const used = new Set<number>()
  const bots: BotRow[] = []
  for (let i = 0; i < count; i++) {
    let ni = Math.floor(rand() * BOT_NAMES.length)
    while (used.has(ni)) ni = (ni + 1) % BOT_NAMES.length
    used.add(ni)
    // spread bot xp around a curve that scales with user effort so it stays competitive
    const base = Math.max(userXp * (0.35 + rand() * 1.5), randInt(rand, 10, 60) + i * 12)
    bots.push({ name: BOT_NAMES[ni], xp: Math.round(base) })
  }
  return bots
}

export function buildLeaderboard(week: string, userXp: number, userName: string) {
  const rows: BotRow[] = [...botBoard(week, userXp), { name: userName, xp: userXp, isYou: true }]
  rows.sort((a, b) => b.xp - a.xp)
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}

export function leagueOutcome(rank: number): 'promoted' | 'demoted' | 'stayed' {
  if (rank <= PROMOTION_ZONE) return 'promoted'
  if (rank >= DEMOTION_RANK) return 'demoted'
  return 'stayed'
}

export function advanceLeague(current: LeagueName, outcome: 'promoted' | 'demoted' | 'stayed'): LeagueName {
  const idx = LEAGUES.indexOf(current)
  if (outcome === 'promoted') return LEAGUES[Math.min(idx + 1, LEAGUES.length - 1)]
  if (outcome === 'demoted') return LEAGUES[Math.max(idx - 1, 0)]
  return current
}

/* ---------------- Daily quests ---------------- */
export interface QuestDef {
  id: string
  label: (goal: number) => string
  goal: number
  reward: number
  progress: (s: QuestSnapshot) => number
}

export interface QuestSnapshot {
  xpToday: number
  lessonsToday: number
  correctToday: number
}

export const DAILY_QUESTS: QuestDef[] = [
  {
    id: 'xp20',
    label: (g) => `Earn ${g} XP`,
    goal: 20,
    reward: 10,
    progress: (s) => s.xpToday,
  },
  {
    id: 'lessons2',
    label: () => 'Complete 2 lessons',
    goal: 2,
    reward: 15,
    progress: (s) => s.lessonsToday,
  },
  {
    id: 'correct10',
    label: (g) => `Answer ${g} questions correctly`,
    goal: 10,
    reward: 15,
    progress: (s) => s.correctToday,
  },
]

/* ---------------- Achievements ---------------- */
export interface AchievementDef {
  id: string
  title: string
  desc: string
  icon: string
  test: (s: AchievementSnapshot) => boolean
}

export interface AchievementSnapshot {
  xpTotal: number
  streakCurrent: number
  lessonsCompleted: number
  crowns: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-lesson', title: 'First Win!', desc: 'Finish your first lesson', icon: '🎉', test: (s) => s.lessonsCompleted >= 1 },
  { id: 'streak-3', title: 'On Fire', desc: 'Keep a 3-day streak', icon: '🔥', test: (s) => s.streakCurrent >= 3 },
  { id: 'streak-7', title: 'Week Warrior', desc: 'Keep a 7-day streak', icon: '⚡', test: (s) => s.streakCurrent >= 7 },
  { id: 'xp-250', title: 'XP Collector', desc: 'Earn 250 XP total', icon: '🌟', test: (s) => s.xpTotal >= 250 },
  { id: 'lessons-10', title: 'Marathon Mind', desc: 'Complete 10 lessons', icon: '🏃', test: (s) => s.lessonsCompleted >= 10 },
  { id: 'crowns-5', title: 'Crown Club', desc: 'Win 5 crown levels', icon: '👑', test: (s) => s.crowns >= 5 },
]
