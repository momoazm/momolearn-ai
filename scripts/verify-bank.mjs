import { QUESTIONS } from '../lib/mbzuai/bank.js';

const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const fails = [];
let n = 0;
const check = (id, ok) => { n++; if (!ok) fails.push(id); };

check('sta1', byId['sta1'].answer === (4 + 8 + 9 + 12 + 7) / 5);
check('cal2', Math.abs(byId['cal2'].answer - 4) < 1e-9);
check('dis3', byId['dis3'].answer === 5050);
check('alg2', byId['alg2'].choices[byId['alg2'].answer] === '5');
check('alg5', (() => { const X = 4, Y = 1; return X + Y === 5 && X * X - Y * Y === 15 && byId['alg5'].choices[byId['alg5'].answer] === '4'; })());
check('pro1', (() => { let fav = 0; for (let a = 0; a < 8; a++) { const bits = ((a >> 0) & 1) + ((a >> 1) & 1) + ((a >> 2) & 1); if (bits === 2) fav++; } return fav === 3 && byId['pro1'].choices[byId['pro1'].answer] === '3/8'; })());
check('pro4', (() => { let fav = 0, tot = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { if (a % 2 === 0) { tot++; if (a + b === 8) fav++; } } return Math.abs(fav / tot - 1 / 6) < 1e-9 && byId['pro4'].choices[byId['pro4'].answer] === '1/6'; })());
check('pro5', (() => { let noHead = 0; for (let m = 0; m < 16; m++) if (!m) noHead++; return (16 - noHead) / 16 === 15 / 16 && byId['pro5'].choices[byId['pro5'].answer] === '15/16'; })());
check('pro6', (() => { let neither = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a !== 6 && b !== 6) neither++; const p = 1 - neither / 36; return Math.abs(p - 11 / 36) < 1e-9 && byId['pro6'].choices[byId['pro6'].answer] === '11/36'; })());
check('sta4', (() => { const d = [2, 4, 6, 8, 10]; const mu = 6; const v = d.reduce((s, x) => s + (x - mu) ** 2, 0) / d.length; return v === 8 && byId['sta4'].choices[byId['sta4'].answer] === '8'; })());
check('lin3', (() => { const A = [[1, 2], [3, 4]], B = [[0, 1], [1, 0]]; const C = [[A[0][0]*B[0][0]+A[0][1]*B[1][0], A[0][0]*B[0][1]+A[0][1]*B[1][1]], [A[1][0]*B[0][0]+A[1][1]*B[1][0], A[1][0]*B[0][1]+A[1][1]*B[1][1]]]; return JSON.stringify(C) === '[[2,1],[4,3]]' && byId['lin3'].answer === 0; })());
check('lin4', (() => { const m = [[2, 0, 1], [1, 3, 2], [1, 1, 1]]; const d = m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]); return d === 0 && byId['lin4'].choices[byId['lin4'].answer] === '0'; })());
check('lin5', byId['lin5'] && [2, 3, -6].reduce((s, c, i) => s + c * [3, -2, 0][i], 0) === 0 && byId['lin5'].answer === 0);
check('log1', (() => { return 30 + 12 === 42 && byId['log1'].choices[byId['log1'].answer] === '42'; })());
check('log4', (() => { for (const A of [0, 1]) for (const B of [0, 1]) { const orig = ((1 - A) || (A && B)) ? 1 : 0; const arrow = ((1 - A) || B) ? 1 : 0; if (orig !== arrow) return false; } return byId['log4'].answer === 0; })());
check('log5', (() => { let v = 2; for (const d of [1, 2, 4, 8]) v += d; return v === 17 && 17 + 16 === 33 && byId['log5'].choices[byId['log5'].answer] === '33'; })());
check('fun2', (() => { const f = (x) => x * x + 1, g = (x) => 2 * x; return f(g(3)) === 37 && byId['fun2'].choices[byId['fun2'].answer] === '37'; })());
check('fun4', (() => { const f = (x) => (3 * x - 2) / 5, inv = (x) => (5 * x + 2) / 3; return Math.abs(f(inv(7)) - 7) < 1e-9 && Math.abs(inv(f(-3)) + 3) < 1e-9 && byId['fun4'].answer === 0; })());
check('fun5', (() => { const slope = (10 - 4) / (3 - 1); const f = (x) => 3 * x + 1; return Math.abs(slope - 3) < 1e-9 && f(5) === 16 && byId['fun5'].choices[byId['fun5'].answer] === '16'; })());
check('cal3', (() => { return byId['cal3'].choices[byId['cal3'].answer] === 'eˣ(x + 1)'; })());
check('cal4', (() => { const fp = (x) => 3 * x * x - 3, fpp = (x) => 6 * x; return Math.abs(fp(-1)) < 1e-9 && fpp(-1) < 0 && fpp(1) > 0 && byId['cal4'].answer === 0; })());
check('cal5', (() => { return byId['cal5'].choices[byId['cal5'].answer] === '3'; })());
check('dis1', (() => { return 2 ** 5 === 32 && byId['dis1'].choices[byId['dis1'].answer] === '32'; })());
check('dis2', (() => { const c = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }; return c(6, 2) === 15 && byId['dis2'].choices[byId['dis2'].answer] === '15'; })());
check('dis4', (() => { return 5 * 4 * 3 === 60 && byId['dis4'].choices[byId['dis4'].answer] === '60'; })());
check('dis5', (() => { return 4 * 3 / 2 === 6 && byId['dis5'].choices[byId['dis5'].answer] === '6'; })());
check('qnt1', (() => { return 240 * 0.15 === 36 && byId['qnt1'].choices[byId['qnt1'].answer] === '36'; })());
check('qnt2', (() => { const v = (150 + 100) / (1.5 + 2); return Math.abs(v - 71.42857142857143) < 1e-9 && byId['qnt2'].answer === 1; })());
check('qnt3', (() => { return Math.abs(1 / (1 / 6 + 1 / 3) - 2) < 1e-9 && byId['qnt3'].choices[byId['qnt3'].answer] === '2 hours'; })());
check('qnt4', Math.abs(1.2 * 0.8 - 0.96) < 1e-9 && byId['qnt4'].answer === 1);
check('qnt5', (() => { const a = 14, t = 28; return t === 2 * a && t + 6 + a + 6 === 54 && byId['qnt5'].choices[byId['qnt5'].answer] === '28'; })());
check('prg2', (() => { let s = 0; for (const i of [2, 4, 6]) s += i * i; return s === 56 && byId['prg2'].answer === 3; })());
check('prg3', (() => { const f = (nn) => nn <= 1 ? 1 : nn * f(nn - 1); return f(4) === 24 && byId['prg3'].answer === 1; })());
check('prg4', (() => { let c = 0; for (let i = 1; i < 4; i++) for (let j = i; j < 4; j++) c++; return c === 6 && byId['prg4'].answer === 1; })());
check('algo2', (() => { let lo = 1, hi = 1000, steps = 0; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); hi = mid; steps++; } return steps <= 10 && byId['algo2'].choices[byId['algo2'].answer] === '10'; })());
check('dat1', ((150 - 120) / 120) * 100 === 25 && byId['dat1'].answer === 1);
check('dat2', ((25 + 20) / 100) * 100 === 45 && byId['dat2'].choices[byId['dat2'].answer] === '45%');
check('csf1', parseInt('1011', 2) === 11 && byId['csf1'].answer === 1);

if (fails.length) {
  console.error('FAILED:', fails.join(', '));
  process.exit(1);
}
console.log(`math-verification-ok (${n} checks)`);
