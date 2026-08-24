import { usePlayer } from '../../engine/store'
import { LEAGUE_META } from '../../engine/gamification'
import { ENERGY_IS_UNLIMITED } from '../../engine/store'

export function TopBar({ onLeagueClick }: { onLeagueClick?: () => void }) {
  const s = usePlayer()
  const league = LEAGUE_META[s.currentLeague]
  return (
    <header className="sticky top-0 z-30 mx-auto flex w-full max-w-xl items-center justify-between gap-2 border-b-2 border-slate-100 bg-white/90 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 font-display text-lg font-extrabold text-orange-500" title="Daily streak">
          🔥 {s.streakCurrent}
        </div>
        <div className="flex items-center gap-1 font-display text-lg font-extrabold text-yellow-500" title="Gems">
          💎 {s.gems}
        </div>
      </div>

      <button
        onClick={onLeagueClick}
        className="flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-slate-50"
        title={`Weekly league: ${s.currentLeague}`}
      >
        <span>{league.icon}</span>
        <span className="font-display text-sm font-bold" style={{ color: league.color }}>
          {s.currentLeague}
        </span>
      </button>

      {ENERGY_IS_UNLIMITED && (
        <div
          className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-2.5 py-0.5 font-display text-xs font-extrabold text-white"
          title="Energy is unlimited for everyone!"
        >
          ∞ ENERGY
        </div>
      )}
    </header>
  )
}
