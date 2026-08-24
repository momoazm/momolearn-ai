import { useState } from 'react'
import { ACHIEVEMENTS, LEAGUES, LEAGUE_META } from '../engine/gamification'
import { usePlayer } from '../engine/store'
import { MASCOTS, Mascot } from '../components/mascots/Mascots'
import { sfx } from '../engine/sfx'
import type { MascotId } from '../content/types'

export function ProfileScreen() {
  const s = usePlayer()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(s.name)

  const lessonsCompleted = Object.values(s.lessonProgress).reduce((a, p) => a + p.completions, 0)
  const crowns = Object.values(s.lessonProgress).reduce((a, p) => a + p.crown, 0)

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
      <div className="flex flex-col items-center">
        <div className="h-32 w-32 gpu animate-float-y"><Mascot id={s.mascot} expression="happy" /></div>
        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={draftName}
              maxLength={16}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-40 rounded-xl border-2 border-speed-blue px-3 py-1.5 text-center font-display font-bold outline-none"
            />
            <button onClick={() => { s.setName(draftName); setEditing(false); sfx.tap() }}
              className="btn3d btn-green !px-3 !py-2 !text-sm">Save</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-2 font-display text-2xl font-extrabold hover:underline">
            {s.name} <span className="text-sm text-slate-400">✏️</span>
          </button>
        )}
        <div className="mt-2 flex gap-2">
          {(Object.keys(MASCOTS) as MascotId[]).map((id) => (
            <button key={id} onClick={() => { sfx.tap(id); s.setMascot(id) }} title={`Play as ${id}`}
              className={`h-10 w-10 rounded-full p-0.5 transition-transform hover:scale-110 ${s.mascot === id ? 'bg-speed-blue' : 'bg-slate-200'}`}>
              <Mascot id={id} expression={s.mascot === id ? 'excited' : 'happy'} />
            </button>
          ))}
        </div>
      </div>

      {/* stats grid */}
      <section className="card-white mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <Stat icon="⚡" label="Total XP" value={String(s.xpTotal)} />
        <Stat icon="🔥" label="Streak" value={`${s.streakCurrent}`} sub={`best ${s.streakLongest}`} />
        <Stat icon="👑" label="Crowns" value={String(crowns)} />
        <Stat icon="📚" label="Lessons" value={String(lessonsCompleted)} />
      </section>

      {/* daily goal */}
      <section className="card-white mt-4">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-slate-400">Daily XP goal</p>
        <div className="mt-2 flex gap-2">
          {[15, 30, 50].map((g) => (
            <button key={g} onClick={() => { sfx.tap(); s.setDailyGoal(g) }}
              className={`btn3d flex-1 !px-2 !py-2.5 !text-base ${s.dailyGoal === g ? 'btn-green' : 'btn-grey'}`}>
              ⚡{g}
            </button>
          ))}
        </div>
      </section>

      {/* league history */}
      <section className="card-white mt-4">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-slate-400">League history</p>
        <p className="mt-1 font-body font-bold text-slate-500">
          Current: <span style={{ color: LEAGUE_META[s.currentLeague].color }}>
            {LEAGUE_META[s.currentLeague].icon} {s.currentLeague}
          </span> · ladder: {LEAGUES.join(' → ')}
        </p>
        {s.leagueHistory.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm font-bold text-slate-400">
            {[...s.leagueHistory].reverse().slice(0, 5).map((h) => (
              <li key={h.weekKey}>
                Week of {h.weekKey}: #{h.rank} · {h.outcome === 'promoted' ? '⬆️ promoted' : h.outcome === 'demoted' ? '⬇️ demoted' : '— stayed'}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* achievements */}
      <section className="card-white mt-4">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-slate-400">Achievements</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = s.achievements.includes(a.id)
            return (
              <li key={a.id} title={a.desc}
                className={`flex items-center gap-2 rounded-xl border-2 p-2 ${got ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 opacity-45 grayscale'}`}>
                <span className="text-2xl">{a.icon}</span>
                <span className="min-w-0 truncate font-display text-xs font-bold">{a.title}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <button onClick={() => { s.toggleSound() }} className="btn3d btn-grey mt-6 w-full">
        {s.soundOn ? '🔊 Sound on' : '🔇 Sound off'}
      </button>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="font-display text-lg font-extrabold">{icon} {value}</p>
      <p className="text-xs font-bold text-slate-400">{label}{sub ? ` · ${sub}` : ''}</p>
    </div>
  )
}
