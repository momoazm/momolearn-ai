import type {
  MatchQuestion,
  McqQuestion,
  OrderQuestion,
  Question,
  TapCountQuestion,
  TypeNumberQuestion,
} from './types'
import { pick, randInt, shuffle, type Rand } from './rng'
import { questionEmojiBank } from './types'

/* ============================ helpers ============================ */

const NUM_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
]

export function numWord(n: number): string {
  if (n <= 20) return NUM_WORDS[n]
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  if (n < 100 && n % 10 === 0) return tens[Math.floor(n / 10)]
  if (n < 100) return `${tens[Math.floor(n / 10)]}-${NUM_WORDS[n % 10]}`
  return String(n)
}

function numDistractors(rand: Rand, answer: number, spread = 1): string[] {
  const deltas = [spread, -spread, spread * 2, -spread * 2, 10, -10]
  const set = new Set<number>()
  let i = 0
  while (set.size < 3 && i < deltas.length * 3) {
    const d = deltas[i % deltas.length] + (i >= deltas.length ? randInt(rand, 1, 3) : 0)
    const cand = answer + d
    if (cand !== answer && cand >= 0) set.add(cand)
    i++
  }
  return [...set].map(String)
}

export function mcq(
  rand: Rand,
  prompt: string,
  answer: string,
  distractors: string[],
  extra?: Partial<McqQuestion>,
): McqQuestion {
  const choices = shuffle(rand, [answer, ...distractors.slice(0, 3)])
  return {
    kind: 'mcq',
    prompt,
    choices,
    answerIndex: choices.indexOf(answer),
    ...extra,
  }
}

const emojis = (rand: Rand, n: number) =>
  Array.from({ length: n }, () => pick(rand, questionEmojiBank))

/* ==================== Unit 1 · Numbers to 100 ==================== */

const COUNT_TARGETS = ['🍎', '⭐', '🎈', '🍪', '🐝'] as const
const COUNT_DECOYS = ['🚗', '🌻', '🐟', '🧩', '⚽'] as const

export function gCountObjects(rand: Rand): Question {
  const n = randInt(rand, 3, 12)
  const decoyN = randInt(rand, 2, Math.min(5, n))
  const targetEmoji = pick(rand, COUNT_TARGETS)
  const decoyPool = COUNT_DECOYS.filter((e) => e !== targetEmoji)
  const cells = shuffle(rand, [
    ...Array<string>(n).fill(targetEmoji),
    ...Array.from({ length: decoyN }, () => pick(rand, decoyPool)),
  ])
  return {
    kind: 'tap-count',
    prompt: `Tap ALL the ${targetEmoji}`,
    target: n,
    targetEmoji,
    cells,
    hint: 'Only tap the ones that match!',
  }
}

export function gOneMoreLess(rand: Rand): Question {
  const n = randInt(rand, 5, 89)
  const more = rand() < 0.5
  const ans = more ? n + 1 : n - 1
  return mcq(
    rand,
    more ? `What is 1 more than ${n}?` : `What is 1 less than ${n}?`,
    String(ans),
    numDistractors(rand, ans),
  )
}

export function gTensOnes(rand: Rand): Question {
  const tens = randInt(rand, 1, 9)
  const ones = randInt(rand, 0, 9)
  const n = tens * 10 + ones
  return {
    kind: 'type-number',
    prompt: `${tens} ten${tens > 1 ? 's' : ''} and ${ones} one${ones === 1 ? '' : 's'} make which number?`,
    visual: { type: 'ten-frames', count: n },
    answer: n,
    hint: 'Tens first, then add the ones.',
  }
}

export function gCompare(rand: Rand): Question {
  let a = randInt(rand, 10, 99)
  let b = randInt(rand, 10, 99)
  if (a === b) b = b > 50 ? b - 7 : b + 7
  const sym = a > b ? '>' : a < b ? '<' : '='
  return mcq(
    rand,
    `Which sign is missing?   ${a} ☐ ${b}`,
    sym,
    ['>', '<', '='].filter((s) => s !== sym),
    { hint: 'The open mouth always eats the BIGGER number!' },
  )
}

export function gOrderNumbers(rand: Rand): Question {
  const start = randInt(rand, 1, 80)
  const step = pick(rand, [1, 2, 5, 10])
  const items = [0, 1, 2, 3].map((i) => start + i * step)
  if (new Set(items).size !== 4) return gOrderNumbers(rand)
  return {
    kind: 'order',
    prompt: 'Put these numbers in order, smallest first!',
    items,
    hint: 'Find the smallest, then count on.',
  }
}

export function gNumWords(rand: Rand): Question {
  const n = randInt(rand, 3, 40)
  const wrong = numDistractors(rand, n, rand() < 0.5 ? 1 : 10).map((w) => numWord(Number(w)))
  return mcq(rand, `Which word shows the number ${n}?`, numWord(n), wrong)
}

/* ===================== Unit 2 · Addition ========================= */

export function gBonds10(rand: Rand): Question {
  const a = randInt(rand, 1, 9)
  const ans = 10 - a
  return {
    kind: 'type-number',
    prompt: `${a} + ? = 10`,
    answer: ans,
    hint: 'How many more fingers make a full pair of hands?',
  }
}

export function gAddWithin20(rand: Rand): Question {
  const a = randInt(rand, 2, 10)
  const b = randInt(rand, 2, Math.min(10, 20 - a))
  const ans = a + b
  return {
    kind: 'type-number',
    prompt: `${a} + ${b} = ?`,
    visual: { type: 'emoji-group', emojis: emojis(rand, Math.min(ans, 12)) },
    answer: ans,
  }
}

export function gAddTwoDigitPlus1(rand: Rand): Question {
  const a = randInt(rand, 11, 88)
  const b = randInt(rand, 1, 9)
  if (a % 10 + b > 10) return gAddTwoDigitPlus1(rand)
  return { kind: 'type-number', prompt: `${a} + ${b} = ?`, answer: a + b }
}

export function gAddTwoDigitPairs(rand: Rand): Question {
  const a = randInt(rand, 12, 45)
  const b = randInt(rand, 12, 45)
  if (a + b > 100 || (a % 10) + (b % 10) >= 10) return gAddTwoDigitPairs(rand)
  return { kind: 'type-number', prompt: `${a} + ${b} = ?`, answer: a + b, hint: 'Add the tens, then add the ones.' }
}

export function gAddWordProblem(rand: Rand): Question {
  const e = pick(rand, ['🍎 apples', '🎈 balloons', '⚽ balls', '🍪 cookies'])
  const a = randInt(rand, 5, 40)
  const b = randInt(rand, 3, 25)
  const who = pick(rand, ['Zippy', 'Pippa', 'Bolt', 'Sparky'])
  return {
    kind: 'type-number',
    prompt: `${who} has ${a} ${e}. Dash gives ${who} ${b} more. How many ${e} now?`,
    answer: a + b,
    hint: 'Joining together means ADD.',
  }
}

/* ==================== Unit 3 · Subtraction ======================= */

export function gSubWithin20(rand: Rand): Question {
  const a = randInt(rand, 8, 20)
  const b = randInt(rand, 1, a - 2)
  return { kind: 'type-number', prompt: `${a} − ${b} = ?`, answer: a - b }
}

export function gSubFrom2Digit(rand: Rand): Question {
  const a = randInt(rand, 25, 99)
  const b = randInt(rand, 1, 9)
  if (a % 10 - b < 0) return gSubFrom2Digit(rand)
  return { kind: 'type-number', prompt: `${a} − ${b} = ?`, answer: a - b }
}

export function gSubTens(rand: Rand): Question {
  const a = randInt(rand, 4, 9) * 10
  const b = randInt(rand, 1, 3) * 10
  return { kind: 'type-number', prompt: `${a} − ${b} = ?`, answer: a - b, hint: 'Take away whole tens.' }
}

export function gDifferenceProblem(rand: Rand): Question {
  const who = pick(rand, ['Zippy', 'Dash', 'Pippa'])
  const a = randInt(rand, 15, 60)
  const b = randInt(rand, 5, a - 5)
  return {
    kind: 'type-number',
    prompt: `${who} scored ${a} points. A rival racer scored ${b}. How many MORE points does ${who} have?`,
    answer: a - b,
    hint: '"How many more?" means find the DIFFERENCE (subtract).',
  }
}

/* ================== Unit 4 · Multiply & Divide =================== */

export function gSkipSequence(rand: Rand): Question {
  const step = pick(rand, [2, 5, 10])
  const start = step * randInt(rand, 1, 6)
  const seq = [start, start + step, start + 2 * step]
  const ans = start + 3 * step
  return mcq(
    rand,
    `${seq.join(', ')}, … what comes next when counting in ${step}s?`,
    String(ans),
    numDistractors(rand, ans, step),
  )
}

export function gTimesTable(rand: Rand): Question {
  const table = pick(rand, [2, 5, 10])
  const b = randInt(rand, 1, 10)
  const ans = table * b
  return mcq(
    rand,
    `${table} × ${b} = ?`,
    String(ans),
    numDistractors(rand, ans, table === 10 ? 10 : table),
    { hint: `Count in ${table}s!` },
  )
}

export function gArrayVisual(rand: Rand): Question {
  const rows = randInt(rand, 2, 5)
  const cols = randInt(rand, 2, 5)
  return {
    kind: 'type-number',
    prompt: `${rows} rows of ${cols} stars. How many stars altogether?`,
    visual: { type: 'shapes', shape: '⭐', count: rows * cols },
    answer: rows * cols,
    hint: `${rows} × ${cols}, or count in ${cols}s.`,
  }
}

export function gSharing(rand: Rand): Question {
  const plates = randInt(rand, 2, 5)
  const each = randInt(rand, 1, 6)
  const total = plates * each
  return {
    kind: 'type-number',
    prompt: `${total} 🍪 shared equally between ${plates} plates. How many on each plate?`,
    answer: each,
    hint: 'Sharing equally means DIVIDE.',
  }
}

export function gOddEven(rand: Rand): Question {
  const n = randInt(rand, 1, 40)
  const isEven = n % 2 === 0
  return mcq(
    rand,
    `Is ${n} odd or even?`,
    isEven ? 'Even' : 'Odd',
    [isEven ? 'Odd' : 'Even'],
    { hint: 'Look at the last digit! Even numbers end in 0, 2, 4, 6, 8.' },
  )
}

export function gMatchNumWords(rand: Rand): MatchQuestion {
  const nums = shuffle(rand, [5, 8, 12, 15, 20, 30, 40, 50, 60]).slice(0, 3)
  return {
    kind: 'match',
    prompt: 'Match each numeral to its word!',
    pairs: nums.map((n) => ({ left: String(n), right: numWord(n) })),
    hint: 'Say each word slowly and listen for the tens.',
  }
}

/* ===================== Unit 5 · Fractions ======================== */

export function gShadedFractionName(rand: Rand): Question {
  const slices = pick(rand, [2, 3, 4])
  const filled = slices === 4 ? randInt(rand, 1, 3) : 1
  const names: Record<number, string> = { 2: 'one half', 3: 'one third', 4: filled === 2 ? 'two quarters' : filled === 3 ? 'three quarters' : 'one quarter' }
  const labels: Record<number, string[]> = {
    2: ['one third', 'one quarter'],
    3: ['one half', 'one quarter'],
    4: ['one half', 'one third'],
  }
  return mcq(
    rand,
    `The pizza has ${slices} equal slices and ${filled} ${filled === 1 ? 'is' : 'are'} eaten. How much is eaten?`,
    names[slices],
    labels[slices],
    { visual: { type: 'fraction', slices, filled } },
  )
}

export function gHalfOfNumber(rand: Rand): Question {
  const half = randInt(rand, 2, 20)
  const n = half * 2
  return {
    kind: 'type-number',
    prompt: `What is HALF of ${n}?`,
    answer: half,
    hint: 'Share into 2 equal groups.',
  }
}

export function gQuarterOfNumber(rand: Rand): Question {
  const q = randInt(rand, 1, 8)
  const n = q * 4
  return {
    kind: 'type-number',
    prompt: `What is a QUARTER of ${n}?`,
    answer: q,
    hint: 'Share into 4 equal groups.',
  }
}

export function gFractionOfSet(rand: Rand): Question {
  const groups = pick(rand, [2, 3])
  const each = randInt(rand, 2, 5)
  const total = groups * each
  const fracName = groups === 2 ? 'half' : 'third'
  return {
    kind: 'type-number',
    prompt: `${total} ⭐ shared into ${groups} equal groups. What is ONE ${fracName} of ${total}?`,
    answer: each,
    hint: `One ${fracName} = one of the ${groups} equal groups.`,
  }
}

/* ================ Unit 6 · Shapes & Position ===================== */

const SHAPE_FACTS: { prompt: string; answer: string; wrong: string[] }[] = [
  { prompt: 'How many sides does a triangle have?', answer: '3', wrong: ['4', '5', '6'] },
  { prompt: 'How many sides does a square have?', answer: '4', wrong: ['3', '5', '6'] },
  { prompt: 'How many sides does a pentagon have?', answer: '5', wrong: ['4', '6', '7'] },
  { prompt: 'How many sides does a hexagon have?', answer: '6', wrong: ['5', '7', '8'] },
  { prompt: 'Which shape has 3 corners?', answer: 'Triangle', wrong: ['Square', 'Circle', 'Hexagon'] },
  { prompt: 'Which shape is round with no corners?', answer: 'Circle', wrong: ['Square', 'Triangle', 'Rectangle'] },
  { prompt: 'A ball is like which 3D shape?', answer: 'Sphere', wrong: ['Cube', 'Cylinder', 'Cone'] },
  { prompt: 'A dice is like which 3D shape?', answer: 'Cube', wrong: ['Sphere', 'Cone', 'Cylinder'] },
  { prompt: 'An ice-cream cone is like which 3D shape?', answer: 'Cone', wrong: ['Cube', 'Sphere', 'Cuboid'] },
  { prompt: 'A tin can is like which 3D shape?', answer: 'Cylinder', wrong: ['Sphere', 'Cone', 'Pyramid'] },
]

export function gShapeFacts(rand: Rand): Question {
  const f = pick(rand, SHAPE_FACTS)
  return mcq(rand, f.prompt, f.answer, shuffle(rand, f.wrong))
}

export function gTurnsDirections(rand: Rand): Question {
  const facing = pick(rand, ['⬆️ North', '➡️ East', '⬇️ South', '⬅️ West'])
  const dirMap: Record<string, Record<string, string>> = {
    '⬆️ North': { right: '➡️ East', left: '⬅️ West' },
    '➡️ East': { right: '⬇️ South', left: '⬆️ North' },
    '⬇️ South': { right: '⬅️ West', left: '➡️ East' },
    '⬅️ West': { right: '⬆️ North', left: '⬇️ South' },
  }
  const turn = rand() < 0.5 ? 'right' : 'left'
  const ans = dirMap[facing][turn].split(' ')[0]
  return mcq(
    rand,
    `Dash races ${facing}. He turns ${turn}. Which way is he facing now?`,
    ans,
    shuffle(rand, ['⬆️', '➡️', '⬇️', '⬅️'].filter((e) => e !== ans)),
  )
}

const PATTERN_BANK = [
  { seq: ['🔺', '🔵', '🔺', '🔵'], next: '🔺', wrong: ['🔵', '🟢', '🟡'] },
  { seq: ['🍎', '🍎', '🍌', '🍎'], next: '🍎', wrong: ['🍌', '🍇', '🍓'] },
  { seq: ['⭐', '🌙', '🌙', '⭐'], next: '🌙', wrong: ['⭐', '☁️', '☀️'] },
  { seq: ['🔴', '🔴', '🔴', '🟢'], next: '🔴', wrong: ['🟢', '🔵', '🟡'] },
]

export function gPatternNext(rand: Rand): Question {
  const p = pick(rand, PATTERN_BANK)
  return mcq(
    rand,
    `${[...p.seq, ...p.seq.slice(0, 3)].join(' ')} … what comes next?`,
    p.next,
    shuffle(rand, p.wrong),
    { hint: 'Say the pattern out loud and find the repeating part.' },
  )
}

/* ====================== Unit 7 · Measures ======================== */

const MEASURE_MCQ: { prompt: string; answer: string; wrong: string[]; hint?: string }[] = [
  { prompt: 'Which is LONGER than a pencil?', answer: 'A door', wrong: ['An eraser', 'A paperclip', 'A stamp'] },
  { prompt: 'Which animal is TALLER than Zippy?', answer: 'A giraffe', wrong: ['A mouse', 'A kitten', 'A frog'] },
  { prompt: 'What would you use to measure your book?', answer: 'Centimetres (cm)', wrong: ['Kilograms (kg)', 'Litres (L)', 'Hours'] },
  { prompt: 'What would you use to measure how heavy you are?', answer: 'Kilograms (kg)', wrong: ['Centimetres (cm)', 'Litres (L)', 'Minutes'] },
  { prompt: 'What would you use to fill a water bottle?', answer: 'Millilitres (ml)', wrong: ['Centimetres (cm)', 'Grams (g)', 'Seconds'] },
  { prompt: 'Which holds MORE water?', answer: 'A bathtub', wrong: ['A cup', 'A spoon', 'A small bowl'] },
  { prompt: 'Which is HEAVIER?', answer: 'A car', wrong: ['A feather', 'A leaf', 'A pencil'] },
  { prompt: 'Half a metre equals…', answer: '50 cm', wrong: ['10 cm', '100 cm', '5 cm'] },
]

export function gMeasureFacts(rand: Rand): Question {
  const f = pick(rand, MEASURE_MCQ)
  return mcq(rand, f.prompt, f.answer, shuffle(rand, f.wrong), f.hint ? { hint: f.hint } : {})
}

export function gMeasureWordProblem(rand: Rand): Question {
  const variant = randInt(rand, 0, 2)
  if (variant === 0) {
    const pencil = randInt(rand, 10, 18)
    const diff = randInt(rand, 2, 6)
    return {
      kind: 'type-number',
      prompt: `A pencil is ${pencil} cm long. An eraser is ${diff} cm shorter. How long is the eraser?`,
      answer: pencil - diff,
      hint: 'Shorter means take away.',
    }
  }
  if (variant === 1) {
    const a = randInt(rand, 20, 60)
    const b = randInt(rand, 10, a - 5)
    return {
      kind: 'type-number',
      prompt: `Zippy's ribbon is ${a} cm. Bolt's ribbon is ${b} cm. How much LONGER is Zippy's ribbon?`,
      answer: a - b,
      hint: 'Find the difference.',
    }
  }
  const jar = randInt(rand, 3, 8)
  return {
    kind: 'type-number',
    prompt: `A jug holds ${jar} cups of juice. Pippa pours in ${jar - 1} cups. How many more cups fit?`,
    answer: 1,
    hint: 'Full capacity minus what is already inside.',
  }
}

/* ===================== Unit 8 · Time & Money ===================== */

export function gClockRead(rand: Rand): Question {
  const hour = randInt(rand, 1, 12)
  const halfPast = rand() < 0.5
  const minute = halfPast ? 30 : 0
  const label = halfPast ? `half past ${hour}` : `${hour} o'clock`
  const wrongLabels = shuffle(rand, [
    `${hour} o'clock`,
    `half past ${(hour % 12) + 1}`,
    `${(hour % 12) + 1} o'clock`,
  ]).filter((w) => w !== label)
  return mcq(rand, 'What time does the clock show?', label, wrongLabels.slice(0, 3), {
    visual: { type: 'clock', hour, minute },
    hint: halfPast ? 'The big hand points straight down at 30 minutes.' : 'The big hand points straight up.',
  })
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function gDayOrder(rand: Rand): OrderQuestion {
  const start = randInt(rand, 0, 4)
  return {
    kind: 'order',
    prompt: 'Put the days in order, starting here!',
    items: DAY_ORDER.slice(start, start + 3),
    hint: 'Sing the days-of-the-week song in your head!',
  }
}

export function gMonthsBetween(rand: Rand): Question {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const i = randInt(rand, 0, 9)
  return mcq(
    rand,
    `Which month comes right after ${months[i]}?`,
    months[i + 1],
    shuffle(rand, [months[(i + 2) % 12], months[(i + 11) % 12], months[i]]),
  )
}

export function gCoinsTotal(rand: Rand): Question {
  const coins = pick(rand, [[1, 1, 2], [2, 5], [5, 5, 2], [1, 2, 2], [10, 5], [2, 2, 1]])
  const total = coins.reduce((a, c) => a + c, 0)
  return {
    kind: 'type-number',
    prompt: `You have these coins: ${coins.map((c) => c + 'p').join(' + ')}. How much money altogether?`,
    answer: total,
    hint: 'Start with the biggest coin and count on.',
  }
}

export function gChangeFrom(rand: Rand): Question {
  const from = pick(rand, [10, 20])
  const cost = randInt(rand, 2, from - 2)
  return {
    kind: 'type-number',
    prompt: `A toy costs ${cost}p. You pay with ${from}p. How much change do you get?`,
    answer: from - cost,
    hint: 'Change = money paid − price.',
  }
}

/* ====================== Unit 9 · Data ============================ */

export function gTallyRead(rand: Rand): Question {
  const n = randInt(rand, 3, 12)
  const symbol = '𝍸'.repeat(Math.floor(n / 5)) + '丨'.repeat(n % 5)
  return {
    kind: 'type-number',
    prompt: `The tally shows: ${symbol}\nHow many does it show?`,
    answer: n,
    hint: 'Every 𝍸 group means 5.',
  }
}

export function gPictogram(rand: Rand): Question {
  const perPic = pick(rand, [1, 2])
  const pics = randInt(rand, 2, 5)
  const other = randInt(rand, 1, pics)
  const emoji = pick(rand, ['🍎', '⚽', '⭐'])
  return {
    kind: 'type-number',
    prompt: `In the pictogram each picture = ${perPic}. Row A has ${pics} ${emoji}; row B has ${other}. How many does row B show?`,
    answer: other * perPic,
    hint: `Multiply the pictures by ${perPic}.`,
  }
}

export function gChartCompare(rand: Rand): Question {
  const a = randInt(rand, 2, 10)
  const b = randInt(rand, 2, 10)
  if (a === b) return gChartCompare(rand)
  const hi = Math.max(a, b)
  return {
    kind: 'type-number',
    prompt: `Class chart: Team Red scored ${a} points, Team Blue scored ${b}. How many MORE did the winning team score?`,
    answer: hi - Math.min(a, b),
    hint: 'Winner minus loser = difference.',
  }
}
