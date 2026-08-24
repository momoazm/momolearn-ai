import { hashString, mulberry32 } from './rng'

/**
 * Zero-asset sound effects via WebAudio oscillators.
 * No files to download -> instant, tiny bundle.
 */
let ctx: AudioContext | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function setMuted(m: boolean) {
  muted = m
}
export function isMuted() {
  return muted
}

function tone(
  freq: number,
  startOffset: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function sweep(from: number, to: number, dur: number, type: OscillatorType = 'triangle', gain = 0.14) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** stable pseudo-random pitch so repeated taps feel musical but varied */
function seededFreq(tag: string) {
  const r = mulberry32(hashString(tag))()
  return 420 + r * 260
}

export const sfx = {
  correct() {
    tone(659, 0, 0.09, 'triangle')
    tone(784, 0.08, 0.09, 'triangle')
    tone(1047, 0.16, 0.18, 'triangle', 0.16)
  },
  wrong() {
    tone(196, 0, 0.22, 'square', 0.06)
    tone(147, 0.05, 0.28, 'square', 0.05)
  },
  tap(tag = 'x') {
    tone(seededFreq('tap' + tag), 0, 0.06, 'sine', 0.07)
  },
  complete() {
    const notes = [523, 587, 659, 784, 1047]
    notes.forEach((n, i) => tone(n, i * 0.11, 0.16, 'triangle', 0.14))
    sweep(600, 1400, 0.5, 'sawtooth', 0.03)
  },
  streak() {
    sweep(300, 900, 0.35, 'triangle', 0.1)
    tone(1319, 0.3, 0.25, 'triangle', 0.12)
  },
  leagueUp() {
    const notes = [392, 523, 659, 784]
    notes.forEach((n, i) => tone(n, i * 0.09, 0.22, 'square', 0.05))
  },
  whoosh() {
    sweep(900, 220, 0.25, 'sine', 0.06)
  },
}
