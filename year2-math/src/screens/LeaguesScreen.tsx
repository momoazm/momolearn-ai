import { motion } from 'framer-motion'
import { buildLeaderboard, LEAGUES, LEAGUE_META } from '../engine/gamification'
import { usePlayer } from '../engine/store'
import { Mascot } from '../components/mascots/Mascots'

export function LeaguesScreen() {
  const s = usePlayer()
  const board = buildLeaderboard(s.weeklyXpWeek, s.weeklyXp, s.name)
  const meta = LEAGUE_META[s.currentLeague]
  const daysLeft = (() => {
    const end = new Date(s.weeklyXpWeek + 'T00:00:00')
    end.setDate(end.getDate() + 7)
    return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
  })()

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
      <div className="flex flex-col items-center">
        <div className="relative h-28 w-28 gpu animate-float-y text-7xl">{meta.icon}</div>
        <h1 className="font-display text-2xl font-extrabold" style={{ color: meta.color }}>
          {s.currentLeague} League
        </h1>
        <p className="text-center font-body text-sm font-bold text-slate-400">
          Top {3} advance 🎉 · Bottom {2} drop down · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
        </p>
      </div>

      {/* promotion / demotion zone markers */}
      <ol className="mt-6 space-y-1">
        {board.map((row, i) => {
          const mine = row.isYou
          const zone =
            i + 1 <= 3 ? 'promo' : i + 1 >= board.length - 1 ? 'demo' : undefined
          return (
            <li key={row.name}>
              {zone && (
                <div className={`my-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${zone === 'promo' ? 'text-emerald-500' : 'text-rose-400'}`}>
                  <span className="flex-1 border-t-2 border-dotted current-color" style={{ borderColor: 'currentColor' }} />
                  {zone === 'promo' ? 'promotion zone ↑' : 'demotion zone ↓'}
                  <span className="flex-1 border-t-2 border-dotted" style={{ borderColor: 'currentColor' }} />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
                  mine ? 'bg-speed-bluelight ring-2 ring-speed-blue' : ''
                }`}
              >
                <span className={`w-7 text-center font-display text-lg font-extrabold ${i === 0 ? 'text-yellow-500' : 'text-slate-400'}`}>
                  {i + 1}
                </span>
                {mine ? (
                  <div className="h-9 w-9 shrink-0"><Mascot id={s.mascot} expression="happy" /></div>
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-display font-extrabold text-slate-400">
                    {row.name[0]}
                  </div>
                )}
                <span className={`min-w-0 flex-1 truncate font-body font-bold ${mine ? 'text-speed-blue' : 'text-slate-600'}`}>
                  {mine ? 'You ⚡' : row.name}
                </span>
                <span className="font-display font-extrabold text-orange-400">{row.xp} XP</span>
              </motion.div>
            </li>
          )
        })}
      </ol>

      {/* league ladder */}
      <section className="card-white mt-8">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-slate-400">All leagues</h2>
        <div className="flex flex-wrap gap-2">
          {LEAGUES.map((l) => (
            <span key={l}
              className={`rounded-xl px-2 py-1 font-display text-xs font-extrabold ${
                l === s.currentLeague ? 'ring-2 ring-offset-1' : 'opacity-50'
              }`}
              style={{ color: LEAGUE_META[l].color, ['--tw-ring-color' as never]: LEAGUE_META[l].color }}>
              {LEAGUE_META[l].icon} {l}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs font-bold text-slate-400">Win XP this week to climb! Weekly XP: {s.weeklyXp}</p>
      </section>
    </div>
  )
}
