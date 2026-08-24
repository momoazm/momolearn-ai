import type { LessonDef, Question, UnitDef } from './types'
import { hashString, mulberry32 } from './rng'
import * as G from './generators'

type Gen = () => Question

function makeLesson(
  id: string,
  title: string,
  objectiveCodes: string[],
  mascotId: LessonDef['intro']['mascotId'],
  introTitle: string,
  introBody: string,
  gens: Gen[],
): LessonDef {
  return {
    id,
    title,
    objectiveCodes,
    intro: { mascotId, title: introTitle, body: introBody },
    generate(n, seed) {
      const rand = mulberry32(hashString(id) ^ (seed * 2654435761))
      const out: Question[] = []
      for (let i = 0; i < n; i++) out.push(gens[i % gens.length]())
      return out
    },
  }
}

const Q_PER_LESSON = 10

/* ============================ UNIT 1 ============================ */
const u1Lessons: LessonDef[] = [
  makeLesson('u1l1', 'Count to 20', ['2Nc.01'], 'zippy', 'Let\'s count!', 'Tap each picture and say the number out loud. One tap = one number!', [G.gCountObjects, G.gOneMoreLess]),
  makeLesson('u1l2', 'Count to 100', ['2Nc.02', '2Nc.03'], 'zippy', 'Big numbers!', 'Numbers go on and on - all the way to 100! Count in steps.', [G.gOneMoreLess, G.gNumWords]),
  makeLesson('u1l3', 'Tens & Ones', ['2Np.01'], 'zippy', 'Place value power!', 'A number like 34 is  tens and  ones. Tens are worth ten each!', [G.gTensOnes]),
  makeLesson('u1l4', 'Compare Numbers', ['2Np.01'], 'dash', 'Who wins?', 'The hungry crocodile mouth always opens toward the BIGGER number!', [G.gCompare]),
  makeLesson('u1l5', 'Order & Words', ['2Np.01', '2Nc.04'], 'dash', 'Line them up!', 'Order numbers smallest to biggest and read number words.', [G.gOrderNumbers, G.gNumWords, G.gMatchNumWords]),
]
const u1Boss = makeLesson('u1boss', 'Unit 1 Boss', [], 'sparky', 'BOSS TIME!', 'Everything you learned about numbers - mixed together. Beat it for a trophy!', [
  G.gCompare, G.gTensOnes, G.gOrderNumbers, G.gNumWords, G.gOneMoreLess,
])

/* ============================ UNIT 2 ============================ */
const u2Lessons: LessonDef[] = [
  makeLesson('u2l1', 'Bonds to 10', ['2Ni.01'], 'zippy', 'Perfect pairs!', 'Number bonds are pairs that snap together to make 10. Like magnets!', [G.gBonds10]),
  makeLesson('u2l2', 'Add within 20', ['2Ni.01'], 'zippy', 'Adding up!', 'Put two groups together and count them all up!', [G.gAddWithin20]),
  makeLesson('u2l3', 'Add 1-digit', ['2Ni.02'], 'zippy', 'Crossing tens!', 'Add ones onto a 2-digit number. Watch what happens when the ones fill up!', [G.gAddTwoDigitPlus1]),
  makeLesson('u2l4', 'Add Two 2-digit', ['2Ni.03'], 'dash', 'Double digits!', 'Split into tens and ones, add tens first, then ones.', [G.gAddTwoDigitPairs]),
  makeLesson('u2l5', 'Story Sums', ['2Ni.04'], 'pippa', 'Maths stories!', 'Real problems hide maths inside. Find the clue words!', [G.gAddWordProblem]),
]
const u2Boss = makeLesson('u2boss', 'Unit 2 Boss', [], 'sparky', 'BOSS TIME!', 'The great addition gauntlet. Show your adding powers!', [
  G.gBonds10, G.gAddWithin20, G.gAddTwoDigitPlus1, G.gAddWordProblem,
])

/* ============================ UNIT 3 ============================ */
const u3Lessons: LessonDef[] = [
  makeLesson('u3l1', 'Subtract to 20', ['2Ni.05'], 'zippy', 'Take away!', 'Subtracting means taking some away and counting what is left.', [G.gSubWithin20]),
  makeLesson('u3l2', '2-digit − 1-digit', ['2Ni.06'], 'zippy', 'Careful counting!', 'Subtract ones from a big number. Watch the tens change!', [G.gSubFrom2Digit]),
  makeLesson('u3l3', 'Take Away Tens', ['2Ni.07'], 'bolt', 'Whole tens!', '40 − 20 is just 4 tens take 2 tens!', [G.gSubTens]),
  makeLesson('u3l4', 'Find Difference', ['2Ni.08'], 'dash', 'How many more?', '"How many more?" asks for the DIFFERENCE between two numbers.', [G.gDifferenceProblem]),
]
const u3Boss = makeLesson('u3boss', 'Unit 3 Boss', [], 'sparky', 'BOSS TIME!', 'Subtraction showdown - every trick you know!', [
  G.gSubWithin20, G.gSubFrom2Digit, G.gSubTens, G.gDifferenceProblem,
])

/* ============================ UNIT 4 ============================ */
const u4Lessons: LessonDef[] = [
  makeLesson('u4l1', 'Skip Counting', ['2Nc.05'], 'dash', 'Jump counting!', 'Count in jumps of 2s, 5s and 10s - like hopping stones!', [G.gSkipSequence]),
  makeLesson('u4l2', '×2 ×5 ×10', ['2Ni.09'], 'dash', 'Times tables!', 'Multiplying is fast adding of equal groups!', [G.gTimesTable]),
  makeLesson('u4l3', 'Arrays', ['2Ni.10'], 'sparky', 'Rows of fun!', 'Rows × columns = total. Multiplication you can SEE!', [G.gArrayVisual]),
  makeLesson('u4l4', 'Sharing Fairly', ['2Ni.11'], 'pippa', 'Fair shares!', 'Dividing means sharing equally between friends.', [G.gSharing]),
  makeLesson('u4l5', 'Odd or Even', ['2Nc.06'], 'bolt', 'Two teams!', 'Even numbers share into 2 equal teams. Odd ones always leave one out!', [G.gOddEven]),
]
const u4Boss = makeLesson('u4boss', 'Unit 4 Boss', [], 'sparky', 'BOSS TIME!', 'The multiplication mega-mix. Ready, set, GO!', [
  G.gSkipSequence, G.gTimesTable, G.gArrayVisual, G.gSharing, G.gOddEven,
])

/* ============================ UNIT 5 ============================ */
const u5Lessons: LessonDef[] = [
  makeLesson('u5l1', 'Halves & Quarters', ['2Nf.01', '2Nf.02'], 'pippa', 'Pizza party!', 'Cut a whole into EQUAL parts - halves, quarters, thirds!', [G.gShadedFractionName]),
  makeLesson('u5l2', 'Half of a Number', ['2Nf.03'], 'pippa', 'Split in two!', 'Half means one of TWO equal groups.', [G.gHalfOfNumber]),
  makeLesson('u5l3', 'Quarters & Thirds', ['2Nf.04'], 'pippa', 'More parts!', 'Quarter = 4 equal groups. Third = 3 equal groups.', [G.gQuarterOfNumber, G.gFractionOfSet]),
  makeLesson('u5l4', 'Fraction Sets', ['2Nf.05'], 'bolt', 'Share the stars!', 'Fractions work on sets of things too!', [G.gFractionOfSet]),
]
const u5Boss = makeLesson('u5boss', 'Unit 5 Boss', [], 'sparky', 'BOSS TIME!', 'The fraction finale - slice through it!', [
  G.gShadedFractionName, G.gHalfOfNumber, G.gQuarterOfNumber, G.gFractionOfSet,
])

/* ============================ UNIT 6 ============================ */
const u6Lessons: LessonDef[] = [
  makeLesson('u6l1', 'Shape Detective', ['2Gg.01'], 'sparky', 'Shape squad!', 'Shapes have sides and corners. Count them like clues!', [G.gShapeFacts]),
  makeLesson('u6l2', '3D Shapes', ['2Gg.03'], 'sparky', 'Solid shapes!', 'Balls, boxes and cans are 3D shapes hiding in plain sight!', [G.gShapeFacts]),
  makeLesson('u6l3', 'Turns & Directions', ['2Gp.01'], 'dash', 'Race turns!', 'Quarter turns left and right - steer the racer!', [G.gTurnsDirections]),
  makeLesson('u6l4', 'Patterns', ['2Nc.07'], 'pippa', 'What comes next?', 'Patterns repeat. Spot the repeating block!', [G.gPatternNext]),
]
const u6Boss = makeLesson('u6boss', 'Unit 6 Boss', [], 'sparky', 'BOSS TIME!', 'Shapes, spins and patterns collide!', [
  G.gShapeFacts, G.gTurnsDirections, G.gPatternNext,
])

/* ============================ UNIT 7 ============================ */
const u7Lessons: LessonDef[] = [
  makeLesson('u7l1', 'Longer & Heavier', ['2Gg.04'], 'bolt', 'Size showdown!', 'Comparing lengths and weights - which is more?', [G.gMeasureFacts]),
  makeLesson('u7l2', 'Choose the Unit', ['2Gg.05'], 'bolt', 'Right tool!', 'cm measures length. g weighs things. ml fills cups!', [G.gMeasureFacts]),
  makeLesson('u7l3', 'Measure Stories', ['2Gg.06'], 'pippa', 'Measuring tales!', 'Word problems about rulers, ribbons and jugs!', [G.gMeasureWordProblem]),
]
const u7Boss = makeLesson('u7boss', 'Unit 7 Boss', [], 'sparky', 'BOSS TIME!', 'The measure marathon!', [G.gMeasureFacts, G.gMeasureWordProblem])

/* ============================ UNIT 8 ============================ */
const u8Lessons: LessonDef[] = [
  makeLesson('u8l1', 'Clock Quest', ['2Gt.01'], 'bolt', 'Tick tock!', 'When the big hand points UP it is o\'clock. DOWN means half past!', [G.gClockRead]),
  makeLesson('u8l2', 'Days & Months', ['2Gt.03'], 'bolt', 'Calendar kid!', 'Seven days a week, twelve months a year - in order!', [G.gDayOrder, G.gMonthsBetween]),
  makeLesson('u8l3', 'Money Coins', ['2Nm.01'], 'pippa', 'Coin counting!', 'Add coins together. Start with the biggest coin!', [G.gCoinsTotal]),
  makeLesson('u8l4', 'Giving Change', ['2Nm.02'], 'dash', 'Shop keeper!', 'Change = what you paid minus the price!', [G.gChangeFrom]),
]
const u8Boss = makeLesson('u8boss', 'Unit 8 Boss', [], 'sparky', 'BOSS TIME!', 'Time and money mastery test!', [
  G.gClockRead, G.gDayOrder, G.gCoinsTotal, G.gChangeFrom,
])

/* ============================ UNIT 9 ============================ */
const u9Lessons: LessonDef[] = [
  makeLesson('u9l1', 'Tally Charts', ['2Ss.01'], 'sparky', 'Count with marks!', 'Four lines then a cross - every bundle is FIVE!', [G.gTallyRead]),
  makeLesson('u9l2', 'Pictograms', ['2Ss.02'], 'sparky', 'Picture data!', 'Each picture stands for a number of things!', [G.gPictogram]),
  makeLesson('u9l3', 'Chart Champions', ['2Ss.03'], 'dash', 'Read & compare!', 'Charts tell stories. Compare the columns to win!', [G.gChartCompare]),
]

export const UNITS: UnitDef[] = [
  { id: 'u1', order: 1, title: 'Numbers to 100', subtitle: 'Counting · Place Value · Comparing', color: '#58cc02', icon: '🔢', lessons: [...u1Lessons, u1Boss], bossLessonIds: [u1Boss.id] },
  { id: 'u2', order: 2, title: 'Super Addition', subtitle: 'Bonds · Column-free Adding', color: '#1cb0f6', icon: '➕', lessons: [...u2Lessons, u2Boss], bossLessonIds: [u2Boss.id] },
  { id: 'u3', order: 3, title: 'Super Subtraction', subtitle: 'Take-away · Differences', color: '#ce82ff', icon: '➖', lessons: [...u3Lessons, u3Boss], bossLessonIds: [u3Boss.id] },
  { id: 'u4', order: 4, title: 'Times Tables Sprint', subtitle: '×2 ×5 ×10 · Sharing', color: '#ff9600', icon: '✖️', lessons: [...u4Lessons, u4Boss], bossLessonIds: [u4Boss.id] },
  { id: 'u5', order: 5, title: 'Fraction Pizza', subtitle: 'Halves · Quarters · Thirds', color: '#ff86d0', icon: '🍕', lessons: [...u5Lessons, u5Boss], bossLessonIds: [u5Boss.id] },
  { id: 'u6', order: 6, title: 'Shape Galaxy', subtitle: '2D & 3D · Turns · Patterns', color: '#00cd9c', icon: '🔷', lessons: [...u6Lessons, u6Boss], bossLessonIds: [u6Boss.id] },
  { id: 'u7', order: 7, title: 'Measure Land', subtitle: 'Length · Weight · Capacity', color: '#ffc800', icon: '📏', lessons: [...u7Lessons, u7Boss], bossLessonIds: [u7Boss.id] },
  { id: 'u8', order: 8, title: 'Time & Money', subtitle: 'Clocks · Days · Coins', color: '#4a90e2', icon: '⏰', lessons: [...u8Lessons, u8Boss], bossLessonIds: [u8Boss.id] },
  { id: 'u9', order: 9, title: 'Data Detectives', subtitle: 'Tallies · Pictograms', color: '#ff6b6b', icon: '📊', lessons: u9Lessons, bossLessonIds: [] },
]

export const ALL_LESSONS: Record<string, { unit: UnitDef; lesson: LessonDef }> = {}
for (const u of UNITS) for (const l of u.lessons) ALL_LESSONS[l.id] = { unit: u, lesson: l }

export const QUESTIONS_PER_LESSON = Q_PER_LESSON
