import type { Expression, MascotProps } from '../../content/types'

/* Original "Speed Squad" cast - all designs are our own artwork,
   deliberately distinct from any existing franchise characters. */

function Eyes({ x1, x2, y, expression }: { x1: number; x2: number; y: number; expression: Expression }) {
  if (expression === 'sad')
    return (
      <g>
        <path d={`M ${x1 - 7} ${y - 6} q 7 -5 14 0`} stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d={`M ${x2 - 7} ${y - 6} q 7 -5 14 0`} stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    )
  if (expression === 'excited' || expression === 'cheer')
    return (
      <g>
        <circle cx={x1} cy={y} r="8" fill="#fff" stroke="#222" strokeWidth="2.5" />
        <circle cx={x2} cy={y} r="8" fill="#fff" stroke="#222" strokeWidth="2.5" />
        <circle cx={x1} cy={y} r="3.4" fill="#222" />
        <circle cx={x2} cy={y} r="3.4" fill="#222" />
        <circle cx={x1 + 3} cy={y - 3} r="1.6" fill="#fff" />
        <circle cx={x2 + 3} cy={y - 3} r="1.6" fill="#fff" />
      </g>
    )
  return (
    <g>
      <ellipse cx={x1} cy={y} rx="7" ry="9" fill="#fff" stroke="#222" strokeWidth="2.5" />
      <ellipse cx={x2} cy={y} rx="7" ry="9" fill="#fff" stroke="#222" strokeWidth="2.5" />
      <circle cx={x1} cy={y + 1} r="3.2" fill="#222" />
      <circle cx={x2} cy={y + 1} r="3.2" fill="#222" />
      <circle cx={x1 + 2.5} cy={y - 3} r="1.4" fill="#fff" />
      <circle cx={x2 + 2.5} cy={y - 3} r="1.4" fill="#fff" />
    </g>
  )
}

function Mouth({ x, y, expression }: { x: number; y: number; expression: Expression }) {
  if (expression === 'sad')
    return <path d={`M ${x - 9} ${y + 6} q 9 -8 18 0`} stroke="#222" strokeWidth="3.5" fill="none" strokeLinecap="round" />
  if (expression === 'thinking') return <circle cx={x} cy={y + 2} r="3.4" fill="#222" />
  if (expression === 'excited' || expression === 'cheer')
    return (
      <path
        d={`M ${x - 11} ${y} q 11 16 22 0 z`}
        fill="#7c2d12"
        stroke="#222"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    )
  return <path d={`M ${x - 9} ${y - 2} q 9 10 18 0`} stroke="#222" strokeWidth="3.5" fill="none" strokeLinecap="round" />
}

const Blush = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => (
  <g opacity="0.55">
    <ellipse cx={x1} cy={y} rx="6" ry="3.6" fill="#fb7185" />
    <ellipse cx={x2} cy={y} rx="6" ry="3.6" fill="#fb7185" />
  </g>
)

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full drop-shadow-md" role="img" aria-hidden>
      {children}
    </svg>
  )
}

/** Zippy - the round blue hedgehog hero. Teal high-tops, soft rounded quills. */
export function Zippy({ expression = 'happy', className = '' }: MascotProps) {
  const ex = expression
  return (
    <Frame>
      {/* soft rounded quills */}
      <g className="gpu origin-[60px_60px] animate-spin-slow" style={{ animationPlayState: ex === 'cheer' ? 'running' : 'paused', display: 'none' }} />
      <path d="M28 38 Q20 20 36 24 Q30 8 46 16 Q44 4 56 12 Q54 2 66 10 L64 26 Z" fill="#2563eb" />
      <path d="M92 38 Q100 20 84 24 Q90 8 74 16 Q76 4 64 12 Z" fill="#2563eb" />
      {/* body */}
      <circle cx="60" cy="62" r="34" fill="#3b82f6" />
      <circle cx="60" cy="70" r="24" fill="#bfdbfe" />
      <Eyes x1={49} x2={71} y={56} expression={ex} />
      <Blush x1={36} x2={84} y={68} />
      <Mouth x={60} y={72} expression={ex} />
      {/* nose */}
      <ellipse cx="60" cy="65" rx="3" ry="2.4" fill="#1e3a8a" />
      {/* feet */}
      <g>
        <ellipse cx="48" cy="97" rx="10" ry="5.5" fill="#0d9488" />
        <ellipse cx="72" cy="97" rx="10" ry="5.5" fill="#0d9488" />
        <rect x="39" y="94" width="18" height="4" rx="2" fill="#fbbf24" />
        <rect x="63" y="94" width="18" height="4" rx="2" fill="#fbbf24" />
      </g>
      {ex === 'cheer' && <text x="96" y="26" fontSize="18">⚡</text>}
    </Frame>
  )
}

/** Dash - the golden cheetah racer with goggles and flame tail-tip. */
export function Dash({ expression = 'happy', className = '' }: MascotProps) {
  const ex = expression
  return (
    <Frame>
      {/* tail with flame */}
      <path d="M88 78 Q108 74 104 58 Q112 66 110 52" fill="none" stroke="#d97706" strokeWidth="7" strokeLinecap="round" />
      <g className="gpu origin-[110px_52px]">
        <path d="M106 50 q8 -10 2 -16 q10 4 6 16 q6 -2 4 -8 q6 8 -4 14 Z" fill="#f97316" className="origin-[112px_42px] animate-flame-flicker" />
      </g>
      {/* ears */}
      <circle cx="34" cy="30" r="9" fill="#b45309" />
      <circle cx="86" cy="30" r="9" fill="#b45309" />
      {/* head/body */}
      <circle cx="60" cy="58" r="33" fill="#f59e0b" />
      <circle cx="60" cy="68" r="23" fill="#fef3c7" />
      {/* goggles on forehead */}
      <rect x="30" y="30" width="60" height="12" rx="6" fill="#111827" />
      <circle cx="47" cy="36" r="6.5" fill="#67e8f9" />
      <circle cx="73" cy="36" r="6.5" fill="#67e8f9" />
      <Eyes x1={48} x2={72} y={58} expression={ex} />
      <Blush x1={34} x2={86} y={68} />
      <Mouth x={60} y={72} expression={ex} />
      <ellipse cx="60" cy="64" rx="2.6" ry="2" fill="#78350f" />
      {/* spots */}
      <circle cx="30" cy="80" r="3.4" fill="#b45309" opacity=".7" />
      <circle cx="90" cy="82" r="3.4" fill="#b45309" opacity=".7" />
      {ex === 'cheer' && <text x="14" y="30" fontSize="18">🏁</text>}
    </Frame>
  )
}

/** Pippa - the pink bunny maths-chef with a carrot clip. */
export function Pippa({ expression = 'happy', className = '' }: MascotProps) {
  const ex = expression
  return (
    <Frame>
      {/* ears */}
      <g className="gpu origin-[45px_40px] animate-float-y">
        <ellipse cx="44" cy="24" rx="8" ry="20" fill="#ec4899" transform="rotate(-8 44 24)" />
        <ellipse cx="44" cy="26" rx="3.6" ry="13" fill="#fbcfe8" transform="rotate(-8 44 26)" />
      </g>
      <g className="gpu origin-[76px_40px] animate-float-y" style={{ animationDelay: '-1.2s' }}>
        <ellipse cx="76" cy="24" rx="8" ry="20" fill="#ec4899" transform="rotate(8 76 24)" />
        <ellipse cx="76" cy="26" rx="3.6" ry="13" fill="#fbcfe8" transform="rotate(8 76 26)" />
      </g>
      {/* body */}
      <circle cx="60" cy="66" r="32" fill="#f472b6" />
      <circle cx="60" cy="74" r="22" fill="#fce7f3" />
      {/* carrot hairclip */}
      <g transform="translate(84 40) rotate(35)">
        <path d="M0 0 L4 12 L-4 12 Z" fill="#fb923c" />
        <rect x="-2.4" y="-7" width="4.8" height="7" rx="2" fill="#4ade80" />
      </g>
      <Eyes x1={49} x2={71} y={60} expression={ex} />
      <Blush x1={36} x2={84} y={70} />
      <Mouth x={60} y={74} expression={ex} />
      <ellipse cx="60" cy="68" rx="2.6" ry="2" fill="#be185d" />
      {ex === 'cheer' && <text x="92" y="34" fontSize="17">🥕</text>}
    </Frame>
  )
}

/** Bolt - the green turtle timekeeper with racing stripes & a propeller cap. */
export function Bolt({ expression = 'happy', className = '' }: MascotProps) {
  const ex = expression
  return (
    <Frame>
      {/* shell */}
      <ellipse cx="60" cy="66" rx="34" ry="28" fill="#059669" />
      <ellipse cx="60" cy="66" rx="24" ry="19" fill="#d1fae5" />
      {/* clock face on shell */}
      <circle cx="60" cy="66" r="15" fill="#fff" stroke="#065f46" strokeWidth="3" />
      <line x1="60" y1="66" x2="60" y2="57" stroke="#065f46" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="60" y1="66" x2="67" y2="69" stroke="#ef4444" strokeWidth="2.6" strokeLinecap="round" />
      {/* racing stripes */}
      <path d="M30 58 h60 M30 76 h60" stroke="#facc15" strokeWidth="3.4" strokeDasharray="8 6" opacity=".85" />
      {/* head */}
      <circle cx="60" cy="34" r="15" fill="#34d399" />
      {/* propeller cap */}
      <path d="M46 24 q14 -8 28 0 l-2 4 q-12 -6 -24 0 Z" fill="#ef4444" />
      <line x1="60" y1="22" x2="60" y2="16" stroke="#334155" strokeWidth="2.4" />
      <g className="gpu origin-[60px_14px] animate-spin-slow" style={{ animationDuration: ex === 'cheer' ? '1.2s' : '9s' }}>
        <ellipse cx="53" cy="14" rx="7" ry="2.6" fill="#fbbf24" />
        <ellipse cx="67" cy="14" rx="7" ry="2.6" fill="#fbbf24" />
      </g>
      <Eyes x1={54} x2={66} y={33} expression={ex} />
      <Mouth x={60} y={41} expression={ex} />
      {/* feet */}
      <ellipse cx="44" cy="95" rx="8" ry="5" fill="#059669" />
      <ellipse cx="76" cy="95" rx="8" ry="5" fill="#059669" />
      {ex === 'cheer' && <text x="92" y="30" fontSize="17">⏰</text>}
    </Frame>
  )
}

/** Sparky - the purple fox quiz-master with a lightning tail-tip. */
export function Sparky({ expression = 'happy', className = '' }: MascotProps) {
  const ex = expression
  return (
    <Frame>
      {/* tail with bolt tip */}
      <path d="M88 80 Q110 78 104 60" fill="none" stroke="#7c3aed" strokeWidth="9" strokeLinecap="round" />
      <path d="M102 56 l10 -4 -4 8 8 -2 -12 12 3 -8 -7 1 Z" fill="#facc15" />
      {/* ears */}
      <path d="M34 34 L30 12 L52 26 Z" fill="#6d28d9" />
      <path d="M86 34 L90 12 L68 26 Z" fill="#6d28d9" />
      <path d="M37 30 L35 19 L46 26 Z" fill="#ddd6fe" />
      <path d="M83 30 L85 19 L74 26 Z" fill="#ddd6fe" />
      {/* body */}
      <circle cx="60" cy="60" r="31" fill="#8b5cf6" />
      <circle cx="60" cy="70" r="21" fill="#ede9fe" />
      {/* glasses */}
      <circle cx="48" cy="56" r="10" fill="rgba(103,232,249,.25)" stroke="#0f172a" strokeWidth="2.6" />
      <circle cx="72" cy="56" r="10" fill="rgba(103,232,249,.25)" stroke="#0f172a" strokeWidth="2.6" />
      <line x1="58" y1="56" x2="62" y2="56" stroke="#0f172a" strokeWidth="2.6" />
      <Eyes x1={48} x2={72} y={56} expression={ex} />
      <Blush x1={34} x2={86} y={68} />
      <Mouth x={60} y={74} expression={ex} />
      <path d="M52 64 q8 6 16 0" stroke="#f97316" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
      {ex === 'cheer' && <text x="12" y="34" fontSize="18">💡</text>}
    </Frame>
  )
}

export const MASCOTS: Record<string, (p: MascotProps) => JSX.Element> = {
  zippy: Zippy,
  dash: Dash,
  pippa: Pippa,
  bolt: Bolt,
  sparky: Sparky,
}

export function Mascot({ id, ...rest }: MascotProps & { id: string }) {
  const C = MASCOTS[id] ?? Zippy
  return <C {...rest} />
}
