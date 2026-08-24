type Tab = 'path' | 'leagues' | 'quests' | 'profile'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'path', icon: '🏁', label: 'Path' },
  { id: 'leagues', icon: '🏆', label: 'Leagues' },
  { id: 'quests', icon: '📜', label: 'Quests' },
  { id: 'profile', icon: '🦔', label: 'You' },
]

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-slate-100 bg-white">
      <div className="mx-auto flex max-w-xl items-stretch justify-around px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`gpu flex flex-col items-center rounded-xl px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
              tab === t.id ? 'bg-speed-bluelight text-speed-blue' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export type { Tab }
