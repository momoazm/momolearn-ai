import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ALL_LESSONS, QUESTIONS_PER_LESSON } from '../content/curriculum'
import { usePlayer } from '../engine/store'
import { Mascot } from '../components/mascots/Mascots'
import { sfx } from '../engine/sfx'
import { hashString, mulberry32, shuffle } from '../content/rng'
import type {
  MatchQuestion,
  McqQuestion,
  OrderQuestion,
  Question,
  TapCountQuestion,
  TypeNumberQuestion,
} from '../content/types'

/* ------------------------------ visuals ------------------------------ */

function ClockVisual({ hour, minute }: { hour: number; minute: number }) {
  const minAngle = minute * 6 - 90
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90
  return (
    <svg viewBox="0 0 120 120" className="mx-auto h-44 w-44">
      <circle cx="60" cy="60" r="54" fill="#fff" stroke="#334155" strokeWidth="6" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i + 1) * 30 - 90) * (Math.PI / 180)
        return (
          <circle key={i} cx={60 + 44 * Math.cos(a)} cy={60 + 44 * Math.sin(a)} r={i % 3 === 2 ? 3 : 2} fill="#475569" />
        )
      })}
      <line x1="60" y1="60" x2={60 + 24 * Math.cos((hourAngle * Math.PI) / 180)} y2={60 + 24 * Math.sin((hourAngle * Math.PI) / 180)} stroke="#0f172a" strokeWidth="7" strokeLinecap="round" />
      <line x1="60" y1="60" x2={60 + 38 * Math.cos((minAngle * Math.PI) / 180)} y2={60 + 38 * Math.sin((minAngle * Math.PI) / 180)} stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="60" r="4" fill="#0f172a" />
    </svg>
  )
}

function Visual({ v }: { v: NonNullable<Question['visual']> }) {
  switch (v.type) {
    case 'emoji-group':
      return (
        <div className="mx-auto flex max-w-md flex-wrap justify-center gap-2 py-2">
          {v.emojis.map((e, i) => (
            <span key={i} className="gpu animate-bob text-3xl" style={{ animationDelay: `${(i % 6) * 0.15}s` }}>
              {e}
            </span>
          ))}
        </div>
      )
    case 'ten-frames':
      return (
        <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-1.5 p-3">
          {Array.from({ length: Math.ceil(v.count / 10) * 10 }, (_, i) => (
            <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 font-display font-bold ${i < v.count ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
              {i < v.count ? i + 1 : ''}
            </span>
          ))}
        </div>
      )
    case 'shapes':
      return (
        <div className="mx-auto flex max-w-md flex-wrap justify-center gap-1 py-2">
          {Array.from({ length: v.count }, (_, i) => (
            <span key={i} className="text-2xl">{v.shape}</span>
          ))}
        </div>
      )
    case 'fraction': {
      const R = 52
      const cx = 60
      const cy = 60
      const slice = (i: number) => {
        const a0 = ((i * 360) / v.slices - 90) * (Math.PI / 180)
        const a1 = (((i + 1) * 360) / v.slices - 90) * (Math.PI / 180)
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0)
        const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1)
        const large = 360 / v.slices > 180 ? 1 : 0
        return (
          <path key={i} d={`M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`}
            fill={i < v.filled ? '#fb923c' : '#fff'} stroke="#78350f" strokeWidth="3" strokeLinejoin="round" />
        )
      }
      return <svg viewBox="0 0 120 120" className="mx-auto h-40 w-40">{Array.from({ length: v.slices }, (_, i) => slice(i))}</svg>
    }
    case 'clock':
      return <ClockVisual hour={v.hour} minute={v.minute} />
    default:
      return null
  }
}

/* --------------------------- keypad input ---------------------------- */

function NumberPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = useCallback((d: string) => {
    sfx.tap(d)
    onChange(d === 'del' ? value.slice(0, -1) : value.length < 4 ? value + d : value)
  }, [onChange, value])
  return (
    <div className="mx-auto mt-3 w-full max-w-xs">
      <div className="mb-3 flex h-16 items-center justify-center rounded-2xl border-2 border-b-4 border-slate-300 bg-white font-display text-4xl font-extrabold tracking-widest">
        {value || <span className="text-slate-300">?</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', ''].map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={i} onClick={() => press(k)}
              className="rounded-xl border-2 border-b-4 border-slate-200 bg-white py-3 font-display text-2xl font-extrabold text-slate-600 transition-transform active:translate-y-0.5 active:border-b-2">
              {k === 'del' ? '⌫' : k}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

/* --------------------------- main screen ----------------------------- */

type Phase = 'intro' | 'playing' | 'done'

export function LessonScreen({ lessonId, onExit }: { lessonId: string; onExit: () => void }) {
  const entry = ALL_LESSONS[lessonId]
  const player = usePlayer()
  const [attempt, setAttempt] = useState(1)
  const [phase, setPhase] = useState<Phase>('intro')
  const [queue, setQueue] = useState<Question[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [feedback, setFeedback] = useState<null | 'correct' | 'wrong'>(null)
  const [mistakes, setMistakes] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)

  // per-question UI state
  const [choiceIdx, setChoiceIdx] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [tapped, setTapped] = useState<Set<number>>(new Set())
  const [pendingLeft, setPendingLeft] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [matchErrors, setMatchErrors] = useState(0)
  const [orderPick, setOrderPick] = useState<number[]>([])

  const q: Question | undefined = queue[qIdx]

  const startLesson = useCallback(() => {
    setQueue(entry.lesson.generate(QUESTIONS_PER_LESSON, attempt))
    setQIdx(0); setPhase('playing'); setFeedback(null); setMistakes(0)
    resetQState()
  }, [entry, attempt])

  function resetQState() {
    setChoiceIdx(null); setTyped(''); setTapped(new Set())
    setPendingLeft(null); setMatched(new Set()); setMatchErrors(0); setOrderPick([])
  }

  const canCheck = useMemo(() => {
    if (!q) return false
    switch (q.kind) {
      case 'mcq': return choiceIdx !== null
      case 'type-number': return typed !== ''
      case 'tap-count': return true
      case 'match': return matched.size === q.pairs.length
      case 'order': return orderPick.length === q.items.length
    }
  }, [q, choiceIdx, typed, tapped, matched, orderPick])

  const isCorrectNow = useCallback((): boolean => {
    if (!q) return false
    switch (q.kind) {
      case 'mcq': return choiceIdx === q.answerIndex
      case 'type-number': return Number(typed) === q.answer
      case 'tap-count': {
        if (tapped.size !== q.target) return false
        return [...tapped].every((i) => q.cells[i] === q.targetEmoji)
      }
      case 'match': return matchErrors === 0
      case 'order':
        return orderPick.every((cellIdx, pos) => cellIdx === pos)
    }
  }, [q, choiceIdx, typed, tapped, matched.size, matchErrors, orderPick])

  function handleCheck() {
    if (!canCheck || !q || feedback) return
    const ok = isCorrectNow()
    if (ok) sfx.correct()
    else sfx.wrong()
    if (!ok) setMistakes((m) => m + 1)
    setFeedback(ok ? 'correct' : 'wrong')
  }

  function handleContinue() {
    if (!q) return
    if (feedback === 'wrong') {
      setQueue((qq) => [...qq, q]) // retry at the end, Duolingo-style
    }
    setFeedback(null)
    resetQState()
    if (qIdx + 1 >= queue.length) {
      finishLesson()
    } else {
      setQIdx((i) => i + 1)
    }
  }

  function finishLesson() {
    const isBoss = entry.lesson.id.endsWith('boss')
    const base = isBoss ? 20 : 10
    const bonus = mistakes === 0 ? 5 : 0
    const gained = base + bonus
    const totalAnswered = QUESTIONS_PER_LESSON + mistakes
    const accuracy = Math.round(((totalAnswered - mistakes) / totalAnswered) * 100)
    const crownsGained = mistakes === 0 ? 1 : mistakes <= 2 ? 1 : 0
    setXpEarned(gained)
    player.completeLesson({
      lessonId,
      xp: gained,
      correct: totalAnswered - mistakes,
      totalQuestions: totalAnswered,
      crownsGained,
      accuracy,
    })
    sfx.complete()
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 }, disableForReducedMotion: true })
    setPhase('done')
  }

  /* ------------------------------ INTRO ------------------------------ */
  if (phase === 'intro') {
    const { intro } = entry.lesson
    return (
      <div className="mx-auto flex h-[100dvh] max-w-xl flex-col items-center justify-center px-6 pb-28 pt-16">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="h-44 w-44 gpu animate-float-y">
          <Mascot id={intro.mascotId} expression="excited" />
        </motion.div>
        <h1 className="mt-4 text-center font-display text-3xl font-extrabold">{intro.title}</h1>
        <p className="mt-2 max-w-sm text-center font-body text-lg font-semibold leading-relaxed text-slate-500">
          {intro.body}
        </p>
        <div className="card-white mt-4 text-center text-sm font-bold text-slate-400">
          Cambridge objectives · {entry.lesson.objectiveCodes.join(' · ') || 'Review boss level'}
        </div>
        <button onClick={() => { sfx.tap(); startLesson() }} className="btn3d btn-green mt-8 gpu">
          Let's go! 🚀
        </button>
        <button onClick={onExit} className="mt-3 font-display text-sm font-bold text-slate-400 hover:text-slate-600">
          ← Back to path
        </button>
      </div>
    )
  }

  /* ------------------------------- DONE ------------------------------ */
  if (phase === 'done') {
    const total = QUESTIONS_PER_LESSON + mistakes
    const accuracy = Math.round(((total - mistakes) / total) * 100)
    return (
      <div className="mx-auto flex h-[100dvh] max-w-xl flex-col items-center justify-center px-6 pb-24">
        <motion.div initial={{ scale: 0.5, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="h-48 w-48 gpu">
          <Mascot id={entry.unit.id === 'u5' ? 'pippa' : player.mascot} expression="cheer" />
        </motion.div>
        <motion.h1 initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
          className="font-display text-4xl font-extrabold text-yellow-500 drop-shadow">
          {mistakes === 0 ? 'PERFECT!' : 'Lesson complete!'}
        </motion.h1>

        <div className="card-white mt-6 grid w-full max-w-xs grid-cols-3 divide-x-2 divide-slate-100 text-center">
          <Stat label="XP" value={`+${xpEarned}`} color="text-orange-500" icon='⚡' delay={0.25} />
          <Stat label="Accuracy" value={`${accuracy}%`} color="text-emerald-500" icon='🎯' delay={0.35} />
          <Stat label="Streak" value={`${player.streakCurrent}🔥`} color="text-red-500" icon='' delay={0.45} />
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
          className="mt-4 text-center font-body font-bold text-slate-400">
          ∞ Energy stays unlimited — play as much as you like!
        </motion.p>

        <button onClick={() => { setAttempt((a) => a + 1); setPhase('intro') }} className="btn3d btn-blue mt-6 gpu">
          Play again
        </button>
        <button onClick={onExit} className="btn3d btn-green mt-2 gpu">Continue</button>
      </div>
    )
  }

  /* ----------------------------- PLAYING ----------------------------- */
  const progress = (qIdx / queue.length) * 100

  return (
    <div className="flex h-[100dvh] max-w-xl mx-auto flex-col px-4">
      {/* header */}
      <div className="flex items-center gap-3 py-3">
        <button onClick={onExit} className="font-display text-2xl text-slate-300 hover:text-slate-500" title="Quit lesson">✕</button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200">
          <motion.div className="h-full rounded-full bg-emerald-400" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>
        <span className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-2 py-0.5 font-display text-xs font-extrabold text-white">∞</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={qIdx + '-' + queue.length}
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
          className="flex-1 overflow-y-auto pb-44">
          {!q ? null : q.kind === 'mcq' ? (
            <McqView q={q} selected={choiceIdx} onSelect={setChoiceIdx} />
          ) :
            q.kind === 'type-number' ? <TypeView q={q} typed={typed} onType={setTyped} /> :
            q.kind === 'tap-count' ? <TapView q={q} tapped={tapped} onTap={(i) => {
              sfx.tap(String(i)); setTapped((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
            }} /> :
            q.kind === 'match' ? <MatchView q={q} pendingLeft={pendingLeft} matched={matched} onPick={(side, key) => {
              if (side === 'left') { setPendingLeft(key); sfx.tap(key) } else if (pendingLeft) {
                const ok = q.pairs.find((p) => p.left === pendingLeft)?.right === key
                if (ok) { sfx.correct(); setMatched((m) => new Set(m).add(pendingLeft + '|' + key)) }
                else { sfx.wrong(); setMatchErrors((e) => e + 1) }
                setPendingLeft(null)
              }
            }} /> :
            <OrderView q={q} picks={orderPick} onPick={(i) => {
              sfx.tap(String(i))
              setOrderPick((p) => p.includes(i) ? p.filter((x) => x !== i) : p.length < q.items.length ? [...p, i] : p)
            }} />}
          {q?.hint && !feedback && (
            <details className="mx-auto mt-4 w-fit text-center">
              <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-wide text-sky-400">💡 Hint</summary>
              <p className="mt-1 max-w-xs font-body text-sm font-semibold text-slate-400">{q.hint}</p>
            </details>
          )}
        </motion.div>
      </AnimatePresence>

      {/* footer */}
      <div className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t-2 px-4 py-4 transition-colors ${
        feedback === 'correct' ? 'border-emerald-200 bg-emerald-50' : feedback === 'wrong' ? 'border-rose-200 bg-rose-50' : 'border-transparent bg-white'}`}>
        <AnimatePresence>
          {feedback && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mb-2 flex items-center gap-3 overflow-hidden">
              <div className="h-12 w-12 shrink-0 gpu animate-bob">
                <Mascot id={feedback === 'correct' ? player.mascot : 'zippy'} expression={feedback === 'correct' ? 'excited' : 'sad'} />
              </div>
              <div>
                <p className={`font-display text-lg font-extrabold ${feedback === 'correct' ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {feedback === 'correct' ? ['Nice one!', 'Zoom-tastic!', 'You speedster!', 'Brilliant!'][qIdx % 4] : 'Not quite!'}
                </p>
                {feedback === 'wrong' && <p className="text-sm font-bold text-slate-500">{correctText(q)}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!feedback ? (
          <button disabled={!canCheck} onClick={handleCheck} className={`btn3d w-full ${canCheck ? 'btn-green' : 'btn-grey'}`}>
            Check
          </button>
        ) : (
          <button onClick={handleContinue} className={`btn3d w-full ${feedback === 'correct' ? 'btn-green' : 'bg-[#ff4b4b] text-white shadow-[0_4px_0_#ea2b2b]'}`}>
            Continue
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color, icon, delay }: { label: string; value: string; color: string; icon: string; delay: number }) {
  return (
    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay }}>
      <p className={`font-display text-xl font-extrabold ${color}`}>{icon} {value}</p>
      <p className="text-xs font-bold text-slate-400">{label}</p>
    </motion.div>
  )
}

function correctText(q: Question): string {
  switch (q.kind) {
    case 'mcq': return `Answer: ${q.choices[q.answerIndex]}`
    case 'type-number': return `Answer: ${q.answer}`
    case 'tap-count': return `There were ${q.target}`
    case 'order': return `Order: ${q.items.join(', ')}`
    case 'match': return 'Look again and try the rematch!'
  }
}

function Prompt({ children, visual }: { children: React.ReactNode; visual?: Question['visual'] }) {
  return (
    <div>
      <h2 className="py-4 text-center font-display text-2xl font-extrabold leading-snug">{children}</h2>
      {visual && <Visual v={visual} />}
    </div>
  )
}

function McqView({ q, selected, onSelect }: { q: McqQuestion; selected: number | null; onSelect: (i: number) => void }) {
  return (
    <div>
      <Prompt visual={q.visual}>{q.prompt}</Prompt>
      <div className={`grid gap-3 ${q.choices.some((c) => c.length > 14) ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {q.choices.map((c, i) => (
          <ChoiceButton key={i} label={c} selected={selected === i} onSelect={() => {
            sfx.tap(c)
            onSelect(i)
          }} />
        ))}
      </div>
    </div>
  )
}

function ChoiceButton({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`choice-btn justify-center text-center ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <span className="block text-center">{label}</span>
    </button>
  )
}

function TypeView({ q, typed, onType }: { q: TypeNumberQuestion; typed: string; onType: (v: string) => void }) {
  return (
    <div>
      <Prompt visual={q.visual}>{q.prompt}</Prompt>
      <NumberPad value={typed} onChange={onType} />
    </div>
  )
}

function TapView({ q, tapped, onTap }: { q: TapCountQuestion; tapped: Set<number>; onTap: (i: number) => void }) {
  return (
    <div>
      <Prompt>{q.prompt}</Prompt>
      <div className="flex flex-wrap justify-center gap-2">
        {q.cells.map((cell, i) => (
          <motion.button key={i} whileTap={{ scale: 0.85 }} onClick={() => onTap(i)}
            className={`gpu relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-b-4 text-3xl transition-colors ${
              tapped.has(i) ? 'border-speed-blue bg-speed-bluelight' : 'border-slate-200 bg-white'}`}
            aria-pressed={tapped.has(i)}>
            {cell}
            {tapped.has(i) && <span className="absolute mt-8 ml-8 h-4 w-4 rounded-full bg-speed-blue text-center text-[10px] font-black text-white">{tapped.size}</span>}
          </motion.button>
        ))}
      </div>
      <p className="pt-3 text-center font-display font-bold text-slate-400">Selected: {tapped.size}</p>
    </div>
  )
}

function MatchView({ q, pendingLeft, matched, onPick }: {
  q: MatchQuestion; pendingLeft: string | null; matched: Set<string>; onPick: (side: 'left' | 'right', key: string) => void
}) {
  const lefts = useMemo(() => [...new Set(q.pairs.map((p) => p.left))], [q])
  const rights = useMemo(() => [...new Set(q.pairs.map((p) => p.right))], [q])
  return (
    <div>
      <Prompt>{q.prompt}</Prompt>
      <div className="grid grid-cols-2 gap-3 px-1">
        <div className="flex flex-col gap-2">
          {lefts.map((l) => (
            <button key={l} onClick={() => onPick('left', l)} disabled={[...matched].some((m) => m.split('|')[0] === l)}
              className={`choice-btn text-center ${pendingLeft === l ? 'selected' : ''} ${[...matched].some((m) => m.split('|')[0] === l) ? 'correct' : ''}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((r) => (
            <button key={r} onClick={() => onPick('right', r)}
              className={`choice-btn text-center ${[...matched].some((m) => m.split('|')[1] === r) ? 'correct' : ''}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderView({ q, picks, onPick }: { q: OrderQuestion; picks: number[]; onPick: (i: number) => void }) {
  const shuffled = useMemo(() => {
    const rand = mulberry32(hashString(q.items.join('|')))
    const idx = shuffle(rand, q.items.map((_, i) => i))
    // guarantee the displayed order is NOT already the answer
    if (idx.every((v, i) => v === i)) idx.push(idx.shift()!)
    return idx
  }, [q])
  return (
    <div>
      <Prompt>{q.prompt}</Prompt>
      <div className="flex flex-wrap justify-center gap-2">
        {shuffled.map((i) => {
          const pos = picks.indexOf(i)
          return (
            <motion.button key={i} layout whileTap={{ scale: 0.92 }} onClick={() => onPick(i)}
              className={`choice-btn relative text-center ${pos >= 0 ? 'selected' : ''}`}>
              {pos >= 0 && <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-speed-blue font-display text-xs font-black text-white">{pos + 1}</span>}
              {q.items[i]}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
