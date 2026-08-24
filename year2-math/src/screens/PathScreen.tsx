import { useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { UNITS, ALL_LESSONS } from '../content/curriculum'
import { usePlayer } from '../engine/store'
import { Mascot } from '../components/mascots/Mascots'
import { sfx } from '../engine/sfx'
import type { LessonDef, UnitDef } from '../content/types'

const OFFSETS = [0, 44, 64, 0, -44, -64] // zigzag x-offsets like Duolingo's winding path

function isUnlocked(unitIdx: number, lessonIdx: number, progress: Record<string, { completions: number }>) {
  if (unitIdx === 0 && lessonIdx === 0) return true
  const flat = UNITS.flatMap((u) => u.lessons.map((l) => l.id))
  const idx = flat.indexOf(UNITS[unitIdx].lessons[lessonIdx].id)
  if (idx <= 0) return true
  const prevId = flat[idx - 1]
  return (progress[prevId]?.completions ?? 0) > 0
}

function unitDone(u: UnitDef, progress: Record<string, { completions: number }>) {
  return u.lessons.every((l) => (progress[l.id]?.completions ?? 0) > 0)
}

export function PathScreen({ onStartLesson }: { onStartLesson: (lessonId: string) => void }) {
  const player = usePlayer()
  const nextRef = useRef<HTMLButtonElement | null>(null)

  const active = useMemo(() => {
    for (const u of UNITS)
      for (let i = 0; i < u.lessons.length; i++)
        if ((player.lessonProgress[u.lessons[i].id]?.completions ?? 0) === 0)
          return { u, i }
    return null
  }, [player.lessonProgress])

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
      {/* daily goal banner */}
      <div className="card-white mb-5 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0">
          <Mascot id={player.mascot} expression="happy" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-slate-500">
            Daily goal · <span className="text-orange-500">🔥 streak day {player.streakCurrent || 'new!'}</span>
          </p>
          <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-orange-400 transition-[width] duration-700"
              style={{ width: `${Math.min(100, (player.todayXp / player.dailyGoal) * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs font-bold text-slate-400">
            {Math.min(player.todayXp, player.dailyGoal)} / {player.dailyGoal} XP today
          </p>
        </div>
      </div>

      {UNITS.map((u, ui) => {
        const done = unitDone(u, player.lessonProgress)
        return (
          <section key={u.id} className="mb-8">
            <motion.header
              initial={{ opacity: 0, y: -8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="sticky top-14 z-20 mb-6 flex items-center justify-between rounded-2xl px-4 py-3 text-white shadow-pop"
              style={{ backgroundColor: u.color }}
            >
              <div>
                <h2 className="font-display text-lg font-extrabold leading-tight">
                  Unit {u.order} · {u.icon} {u.title}
                </h2>
                <p className="text-xs font-bold opacity-90">{u.subtitle}</p>
              </div>
              {done && <span title="Unit complete!" className="text-2xl">🏅</span>}
            </motion.header>

            <ol className="flex flex-col items-center gap-4">
              {u.lessons.map((l: LessonDef, li) => {
                const unlocked = isUnlocked(ui, li, player.lessonProgress)
                const prog = player.lessonProgress[l.id]
                const crowns = prog?.crown ?? 0
                const isActive = active?.u.id === u.id && active.i === li
                const offset = OFFSETS[(ui * 3 + li) % OFFSETS.length]
                const isBoss = l.id.endsWith('boss')
                return (
                  <li key={l.id} style={{ transform: `translateX(${offset}px)` }}>
                    <button
                      ref={isActive ? nextRef : undefined}
                      disabled={!unlocked}
                      onClick={() => {
                        sfx.whoosh()
                        onStartLesson(l.id)
                      }}
                      className={`gpu group relative flex flex-col items-center transition-transform duration-150 ${
                        unlocked ? 'hover:scale-105 active:scale-95' : 'cursor-not-allowed opacity-50'
                      }`}
                      title={unlocked ? l.title : 'Finish the previous lesson to unlock!'}
                    >
                      <span
                        className={`relative flex items-center justify-center rounded-full border-b-[6px] font-display text-xl shadow-pop ${
                          isBoss ? 'h-24 w-24 text-3xl' : 'h-16 w-16'
                        } ${unlocked ? 'border-slate-900/20 text-white' : 'border-slate-300/40 bg-slate-300 text-white'}`}
                        style={
                          unlocked
                            ? {
                                backgroundColor:
                                  crowns >= 3 ? '#f59e0b' : isActive ? '#58cc02' : u.color,
                              }
                            : undefined
                        }
                      >
                        {isBoss ? '👑' : unlocked ? '⭐' : '🔒'}
                        {isActive && (
                          <>
                            <span className="absolute -inset-2 animate-ping rounded-full border-4" style={{ borderColor: u.color }} />
                            <span className="absolute -top-9 whitespace-nowrap rounded-xl bg-white px-2 py-0.5 font-display text-xs font-extrabold text-emerald-600 shadow">
                              START
                            </span>
                          </>
                        )}
                      </span>
                      <span className="mt-1 max-w-36 truncate text-center font-display text-xs font-bold text-slate-500">
                        {crowns > 0 && !isBoss ? '★'.repeat(crowns) : ''} {l.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            {done && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="h-10 w-10"><Mascot id="zippy" expression="cheer" /></div>
                <p className="font-display text-sm font-extrabold text-emerald-600">Unit mastered! 🎉</p>
              </div>
            )}
          </section>
        )
      })}
      <footer className="pb-4 text-center text-xs font-bold text-slate-300">
        MomoMath Year 2 · Cambridge Primary Maths Stage 2 · {Object.keys(ALL_LESSONS).length} lessons
      </footer>
    </div>
  )
}
