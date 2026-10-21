import { createRng } from '../utils/random';
import type { Prepared } from './prepare';
import type { Problem } from './types';

/**
 * Local search (simulated annealing) die een geldige indeling verbetert.
 *
 * Iedere stap verplaatst een leerling naar een lege zitplaats of wisselt twee leerlingen.
 * Een stap wordt alleen overwogen als alle harde beperkingen geldig blijven, dus de
 * indeling is na iedere stap nog steeds geldig. De doelfunctie is:
 *   (gewogen voldane voorkeuren) − (variatiestraf t.o.v. eerdere indelingen).
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface OptimizeOptions {
  seed: number;
  timeMs: number;
  maxIterations?: number;
  /** Extra vermenigvuldiging van de variatiestraf. */
  variationBoost?: number;
}

export function optimize(prep: Prepared, problem: Problem, initial: ArrayLike<number>, opts: OptimizeOptions): Int32Array {
  const { n, m } = prep;
  const rng = createRng(opts.seed);
  const seatOf = Int32Array.from(initial);
  const studentAt = new Int32Array(m).fill(-1);
  for (let i = 0; i < n; i++) if (seatOf[i] >= 0) studentAt[seatOf[i]] = i;
  if (n === 0) return seatOf;

  const usePrefs = problem.optimizePreferences;
  const boost = opts.variationBoost ?? 1;

  // Domeinlijsten (unair geldig) per leerling.
  const domainList: number[][] = [];
  for (let i = 0; i < n; i++) {
    const list: number[] = [];
    for (let s = 0; s < m; s++) if (prep.baseDomains[i * m + s]) list.push(s);
    domainList.push(list);
  }
  const movable: number[] = [];
  for (let i = 0; i < n; i++) if (domainList[i].length > 1) movable.push(i);
  if (movable.length === 0) return seatOf;

  // Variatie: gewicht per eerdere oplossing (recenter = zwaarder).
  const prevWeights = problem.previous.map((_, k) => 1 / (k + 1));
  const seatRepeatW = problem.variation.seatRepeat * boost;
  const pairRepeatW = problem.variation.pairRepeat * boost;
  const seatPenalty = new Float64Array(n * m);
  problem.previous.forEach((prev, k) => {
    for (let i = 0; i < n; i++) {
      const s = prev[i];
      if (s >= 0 && s < m) seatPenalty[i * m + s] += seatRepeatW * prevWeights[k];
    }
  });
  const together = new Float64Array(n * n);
  if (pairRepeatW > 0) {
    problem.previous.forEach((prev, k) => {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const s = prev[i];
          const t = prev[j];
          if (s >= 0 && t >= 0 && s < m && t < m && problem.groupOf[s] === problem.groupOf[t]) {
            together[i * n + j] += pairRepeatW * prevWeights[k];
            together[j * n + i] += pairRepeatW * prevWeights[k];
          }
        }
      }
    });
  }
  const groupSeats = new Map<number, number[]>();
  problem.groupOf.forEach((g, s) => {
    if (!groupSeats.has(g)) groupSeats.set(g, []);
    groupSeats.get(g)!.push(s);
  });

  /** Bijdrage aan de doelfunctie van alle termen waarin leerling x of y voorkomt. */
  const localValue = (x: number, y: number): number => {
    let v = 0;
    const counted = new Set<number>();
    for (const st of y >= 0 ? [x, y] : [x]) {
      const s = seatOf[st];
      if (usePrefs) {
        v += prep.softUnary[st * m + s];
        for (const link of prep.softPairs[st]) {
          if (counted.has(link.constraint)) continue;
          counted.add(link.constraint);
          if (link.compat(s, seatOf[link.other])) v += problem.constraints[link.constraint].weight;
        }
      }
      v -= seatPenalty[st * m + s];
      if (pairRepeatW > 0) {
        for (const t of groupSeats.get(problem.groupOf[s])!) {
          const k = studentAt[t];
          if (k < 0 || k === st) continue;
          if (k === x || k === y) {
            if (st < k) v -= together[st * n + k]; // paar (x,y) één keer tellen
          } else v -= together[st * n + k];
        }
      }
    }
    return v;
  };

  const hardOk = (st: number): boolean => {
    const s = seatOf[st];
    for (const link of prep.hardPairs[st]) if (!link.compat(s, seatOf[link.other])) return false;
    return true;
  };

  const totalValue = (): number => {
    let v = 0;
    if (usePrefs) {
      for (let i = 0; i < n; i++) v += prep.softUnary[i * m + seatOf[i]];
      for (const sp of prep.softPairList) if (sp.compat(seatOf[sp.a], seatOf[sp.b])) v += sp.weight;
    }
    for (let i = 0; i < n; i++) {
      v -= seatPenalty[i * m + seatOf[i]];
      for (let j = i + 1; j < n; j++) {
        if (problem.groupOf[seatOf[i]] === problem.groupOf[seatOf[j]]) v -= together[i * n + j];
      }
    }
    return v;
  };

  let current = totalValue();
  let best = current;
  const bestSeatOf = seatOf.slice();
  const start = now();
  const T0 = 2.5;
  const Tend = 0.03;
  const maxIt = opts.maxIterations ?? 400_000;
  let T = T0;

  for (let it = 0; it < maxIt; it++) {
    if ((it & 255) === 0) {
      const frac = (now() - start) / Math.max(1, opts.timeMs);
      if (frac >= 1) break;
      T = T0 * Math.pow(Tend / T0, frac);
    }
    const i = movable[Math.floor(rng() * movable.length)];
    const dl = domainList[i];
    const t = dl[Math.floor(rng() * dl.length)];
    const s = seatOf[i];
    if (t === s) continue;
    const j = studentAt[t];
    if (j >= 0 && !prep.baseDomains[j * m + s]) continue;

    const before = localValue(i, j);
    // Voer de stap uit.
    seatOf[i] = t;
    studentAt[t] = i;
    if (j >= 0) {
      seatOf[j] = s;
      studentAt[s] = j;
    } else studentAt[s] = -1;

    let accept = hardOk(i) && (j < 0 || hardOk(j));
    let delta = 0;
    if (accept) {
      delta = localValue(i, j) - before;
      accept = delta >= 0 || rng() < Math.exp(delta / T);
    }
    if (accept) {
      current += delta;
      if (current > best + 1e-9) {
        best = current;
        bestSeatOf.set(seatOf);
      }
    } else {
      // Terugdraaien.
      seatOf[i] = s;
      studentAt[s] = i;
      if (j >= 0) {
        seatOf[j] = t;
        studentAt[t] = j;
      } else studentAt[t] = -1;
    }
  }
  // Zonder verbetering: geef de laatst bezochte (gelijkwaardige) indeling terug voor extra variatie.
  return best > current + 1e-9 ? bestSeatOf : seatOf;
}
