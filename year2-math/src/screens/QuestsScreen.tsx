import { ACHIEVEMENTS, DAILY_QUESTS } from '../engine/gamification'
import { isQuestClaimed, questProgressSnapshot, questsDone, usePlayer } from '../engine/store'
import { Mascot } from '../components/mascots/Mascots'
import { sfx } from '../engine/sfx'

export function QuestsScreen() {
  const s = usePlayer()
  const snap = questProgressSnapshot(s)
  const doneIds = questsDone(s)

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
      <div className="mb-5 flex items-center justify-center gap-3">
        <div className="h-16 w-16 gpu animate-bob"><Mascot id="dash" expression="excited" /></div>
        <h1 className="font-display text-2xl font-extrabold text-speed-blue">Daily Quests</h1>
      </div>
      <p className="mb-4 text-center font-body text-sm font-bold text-slate-400">
        Fresh quests every midnight · earn 💎 gems
      </p>

      <ul className="space-y-3">
        {DAILY_QUESTS.map((q) => {
          const p = Math.min(q.progress(snap), q.goal)
          const done = doneIds.includes(q.id)
          const claimed = isQuestClaimed(s, q.id)
          return (
            <li key={q.id} className="card-white flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl">
                {done ? '🎁' : '📜'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold">{q.label(q.goal)}</p>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-emerald-400' : 'bg-speed-blue'}`}
                    style={{ width: `${(p / q.goal) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-xs font-bold text-slate-400">{p} / {q.goal}</p>
              </div>
              <button
                disabled={!done || claimed}
                onClick={() => { sfx.leagueUp(); s.claimQuest(q.id, q.reward) }}
                className={`btn3d !px-3 !py-2 !text-sm ${done && !claimed ? 'btn-green' : 'btn-grey'}`}>
                {claimed ? '✓' : `💎${q.reward}`}
              </button>
            </li>
          )
        })}
      </ul>

      <section className="card-white mt-6 flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="text-3xl">♾️</div>
        <div>
          <p className="font-display font-extrabold text-emerald-700">Unlimited Energy for everyone</p>
          <p className="text-xs font-bold text-slate-400">No hearts. No timers. Learn as long as you like!</p>
        </div>
      </section>

      {s.achievements.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-slate-400">Achievements unlocked</h2>
          <ul className="space-y-2">
            {s.achievements.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id)
              if (!a) return null
              return (
                <li key={id} className="card-white flex items-center gap-3 !py-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div><p className="font-display font-bold">{a.title}</p><p className="text-xs font-bold text-slate-400">{a.desc}</p></div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
