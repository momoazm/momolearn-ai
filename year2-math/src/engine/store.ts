import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MascotId } from '../content/types'
import {
  ACHIEVEMENTS,
  DAILY_QUESTS,
  advanceLeague,
  buildLeaderboard,
  leagueOutcome,
  nextWeekKey,
  todayISO,
  weekKey,
  yesterdayISO,
  type LeagueName,
} from './gamification'
import { sfx } from './sfx'

export interface LessonProgress {
  crown: number
  bestAccuracy: number
  completions: number
}

export interface LeagueHistoryEntry {
  weekKey: string
  league: LeagueName
  rank: number
  outcome: 'promoted' | 'demoted' | 'stayed'
}

/** Energy is UNLIMITED for everyone - kept as an explicit constant so the UI
 *  can proudly show ∞ and future features can still reference it. */
export const ENERGY_IS_UNLIMITED = true

interface PlayerState {
  name: string
  mascot: MascotId
  xpTotal: number
  gems: number
  streakCurrent: number
  streakLongest: number
  lastActiveDay: string | null
  dailyGoal: number
  todayXpDay: string
  todayXp: number
  lessonsTodayDay: string
  lessonsToday: number
  correctTodayDay: string
  correctToday: number
  weeklyXpWeek: string
  weeklyXp: number
  lessonProgress: Record<string, LessonProgress>
  claimedQuests: { day: string; questIds: string[] }
  achievements: string[]
  currentLeague: LeagueName
  leagueHistory: LeagueHistoryEntry[]
  soundOn: boolean

  // actions
  completeLesson: (args: {
    lessonId: string
    xp: number
    correct: number
    totalQuestions: number
    crownsGained: number
    accuracy: number
  }) => void
  setDailyGoal: (g: number) => void
  setName: (n: string) => void
  setMascot: (m: MascotId) => void
  toggleSound: () => void
  claimQuest: (questId: string, reward: number) => void
}

function rollDay(s: PlayerState) {
  const today = todayISO()
  if (s.todayXpDay !== today) {
    s.todayXpDay = today
    s.todayXp = 0
  }
  if (s.lessonsTodayDay !== today) {
    s.lessonsTodayDay = today
    s.lessonsToday = 0
  }
  if (s.correctTodayDay !== today) {
    s.correctTodayDay = today
    s.correctToday = 0
  }
}

/** Weekly league rollover: settle last week's rank, promote/demote, reset XP. */
function rollWeek(s: PlayerState) {
  const wk = weekKey()
  if (s.weeklyXpWeek === wk) return
  const prevWeek = s.weeklyXpWeek || wk
  const board = buildLeaderboard(prevWeek, s.weeklyXp, s.name)
  const myRank = board.find((r) => r.isYou)?.rank ?? 10
  const outcome = leagueOutcome(myRank)
  s.currentLeague = advanceLeague(s.currentLeague, outcome)
  s.leagueHistory = [
    ...s.leagueHistory.slice(-9),
    { weekKey: prevWeek, league: s.currentLeague, rank: myRank, outcome },
  ]
  s.weeklyXpWeek = wk
  s.weeklyXp = 0
}

function updateStreak(s: PlayerState) {
  const today = todayISO()
  if (s.lastActiveDay === today) return
  if (s.lastActiveDay === yesterdayISO()) {
    s.streakCurrent += 1
  } else {
    s.streakCurrent = 1
  }
  s.streakLongest = Math.max(s.streakLongest, s.streakCurrent)
  s.lastActiveDay = today
}

function checkAchievements(s: PlayerState) {
  const lessonsCompleted = Object.values(s.lessonProgress).reduce(
    (a, p) => a + p.completions,
    0,
  )
  const crowns = Object.values(s.lessonProgress).reduce((a, p) => a + p.crown, 0)
  const snap = {
    xpTotal: s.xpTotal,
    streakCurrent: s.streakCurrent,
    lessonsCompleted,
    crowns,
  }
  let gained = false
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.test(snap)) {
      s.achievements.push(a.id)
      s.gems += 20
      gained = true
    }
  }
  if (gained) sfx.leagueUp()
}

const firstDay = todayISO()

export const usePlayer = create<PlayerState>()(
  persist(
    (set) => ({
      name: 'Champion',
      mascot: 'zippy' as MascotId,
      xpTotal: 0,
      gems: 50,
      streakCurrent: 0,
      streakLongest: 0,
      lastActiveDay: null,
      dailyGoal: 30,
      todayXpDay: firstDay,
      todayXp: 0,
      lessonsTodayDay: firstDay,
      lessonsToday: 0,
      correctTodayDay: firstDay,
      correctToday: 0,
      weeklyXpWeek: weekKey(),
      weeklyXp: 0,
      lessonProgress: {},
      claimedQuests: { day: firstDay, questIds: [] },
      achievements: [],
      currentLeague: 'Bronze',
      leagueHistory: [],
      soundOn: true,

      completeLesson: ({ lessonId, xp, correct, totalQuestions, crownsGained, accuracy }) =>
        set((state) => {
          const s: PlayerState = {
            ...state,
            lessonProgress: { ...state.lessonProgress },
          }
          rollDay(s)
          rollWeek(s)

          const prev = s.lessonProgress[lessonId] ?? {
            crown: 0,
            bestAccuracy: 0,
            completions: 0,
          }
          s.lessonProgress[lessonId] = {
            crown: Math.min(prev.crown + crownsGained, 3),
            bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
            completions: prev.completions + 1,
          }

          s.xpTotal += xp
          s.gems += 2 + Math.round(xp / 10)
          s.todayXp += xp
          s.lessonsToday += 1
          s.correctToday += correct
          s.weeklyXp += xp

          const wasStreakActive = state.lastActiveDay === todayISO()
          updateStreak(s)

          checkAchievements(s)

          if (!wasStreakActive && s.streakCurrent > 1) sfx.streak()

          return s
        }),

      setDailyGoal: (g) => set({ dailyGoal: g }),
      setName: (n) => set({ name: n.trim() || 'Champion' }),
      setMascot: (m) => set({ mascot: m }),
      toggleSound: () =>
        set((state) => {
          const on = !state.soundOn
          import('./sfx').then((m) => m.setMuted(!on))
          return { soundOn: on }
        }),
      claimQuest: (questId, reward) =>
        set((state) => {
          const today = todayISO()
          const base =
            state.claimedQuests.day === today ? state.claimedQuests.questIds : []
          if (base.includes(questId)) return state
          return {
            gems: state.gems + reward,
            claimedQuests: { day: today, questIds: [...base, questId] },
          }
        }),
    }),
    { name: 'momomath-year2-player' },
  ),
)

export function questProgressSnapshot(s: PlayerState) {
  return {
    xpToday: s.todayXp,
    lessonsToday: s.lessonsToday,
    correctToday: s.correctToday,
  }
}

export function questsDone(s: PlayerState) {
  const snap = questProgressSnapshot(s)
  return DAILY_QUESTS.filter((q) => q.progress(snap) >= q.goal).map((q) => q.id)
}

export function isQuestClaimed(s: PlayerState, questId: string) {
  if (s.claimedQuests.day !== todayISO()) return false
  return s.claimedQuests.questIds.includes(questId)
}
