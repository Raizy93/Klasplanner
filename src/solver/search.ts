import { createRng, shuffleInPlace } from '../utils/random';
import type { Prepared } from './prepare';

/**
 * Volledige backtracking-zoeker voor de harde beperkingen.
 *
 *  - Minimum Remaining Values: kies steeds de leerling met de minste mogelijke zitplaatsen.
 *  - Forward checking: na iedere keuze worden domeinen van andere leerlingen direct ingeperkt
 *    (zitplaats bezet + binaire regels zoals "mag niet naast").
 *  - Matching-controle (stelling van Hall): na iedere stap wordt gecontroleerd of er nog een
 *    toewijzing bestaat die iedere resterende leerling een eigen zitplaats geeft. Dit snoeit
 *    hopeloze takken (bijv. "10 leerlingen moeten vooraan, er zijn 8 plaatsen") vroegtijdig af.
 *
 * De zoeker is compleet: als hij de hele zoekruimte doorloopt zonder oplossing,
 * is aangetoond dat er geen geldige indeling bestaat.
 */

export type SearchOutcome =
  | { status: 'solved'; seatOf: Int32Array; nodes: number }
  | { status: 'infeasible'; nodes: number }
  | { status: 'timeout'; nodes: number }
  | { status: 'nodeLimit'; nodes: number };

export interface SearchOptions {
  seed: number;
  deadline: number;
  nodeLimit?: number;
  /** Zitplaatsen met hogere voorkeurswaarde eerst proberen. */
  valueBias?: boolean;
}

class Abort {
  constructor(public readonly kind: 'timeout' | 'nodeLimit') {}
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface HallViolation {
  students: number[];
  seats: number[];
}

/**
 * Zoekt een maximale matching tussen leerlingen en zitplaatsen binnen hun domeinen.
 * Retourneert een Hall-schending (leerlingenset met te weinig gezamenlijke zitplaatsen) als die bestaat.
 */
export function findHallViolation(dom: Uint8Array, n: number, m: number): HallViolation | null {
  const matchS = new Int32Array(n).fill(-1);
  const matchT = new Int32Array(m).fill(-1);
  const visitedSeat = new Uint8Array(m);
  const visitedStudent = new Uint8Array(n);
  const augment = (u: number): boolean => {
    visitedStudent[u] = 1;
    for (let s = 0; s < m; s++) {
      if (!dom[u * m + s] || visitedSeat[s]) continue;
      visitedSeat[s] = 1;
      if (matchT[s] === -1 || augment(matchT[s])) {
        matchS[u] = s;
        matchT[s] = u;
        return true;
      }
    }
    return false;
  };
  for (let u = 0; u < n; u++) {
    visitedSeat.fill(0);
    visitedStudent.fill(0);
    if (!augment(u)) {
      const students: number[] = [];
      const seats: number[] = [];
      visitedStudent.forEach((v, i) => v && students.push(i));
      visitedSeat.forEach((v, s) => v && seats.push(s));
      return { students, seats };
    }
  }
  return null;
}

export function runSearch(prep: Prepared, opts: SearchOptions): SearchOutcome {
  const { n, m } = prep;
  const dom = prep.baseDomains.slice();
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let s = 0; s < m; s++) c += dom[i * m + s];
    size[i] = c;
  }
  const assigned = new Int32Array(n).fill(-1);
  const trail: number[] = [];
  const rng = createRng(opts.seed);
  const tieBreak = Array.from({ length: n }, () => rng());
  let nodes = 0;

  const matchS = new Int32Array(n).fill(-1);
  const matchT = new Int32Array(m).fill(-1);
  const stamp = new Int32Array(m);
  let stampId = 0;

  const augment = (u: number): boolean => {
    const base = u * m;
    for (let s = 0; s < m; s++) {
      if (!dom[base + s] || stamp[s] === stampId) continue;
      stamp[s] = stampId;
      if (matchT[s] === -1 || augment(matchT[s])) {
        matchS[u] = s;
        matchT[s] = u;
        return true;
      }
    }
    return false;
  };

  // Een matching die geldig is voor kleinere domeinen blijft geldig voor de grotere domeinen
  // van een ouderknoop; bij terugspringen hoeft de matching dus niet hersteld te worden.
  const repairMatching = (): boolean => {
    for (let u = 0; u < n; u++) {
      const s = matchS[u];
      if (s >= 0 && !dom[u * m + s]) {
        matchS[u] = -1;
        if (matchT[s] === u) matchT[s] = -1;
      }
    }
    for (let u = 0; u < n; u++) {
      if (matchS[u] === -1) {
        stampId++;
        if (!augment(u)) return false;
      }
    }
    return true;
  };

  const remove = (i: number, s: number): boolean => {
    const k = i * m + s;
    if (dom[k]) {
      dom[k] = 0;
      size[i]--;
      trail.push(k);
    }
    return size[i] > 0;
  };

  const undoTo = (mark: number) => {
    while (trail.length > mark) {
      const k = trail.pop()!;
      dom[k] = 1;
      size[(k / m) | 0]++;
    }
  };

  const tick = () => {
    nodes++;
    if (opts.nodeLimit && nodes > opts.nodeLimit) throw new Abort('nodeLimit');
    if ((nodes & 127) === 0 && now() > opts.deadline) throw new Abort('timeout');
  };

  const selectVar = (): number => {
    let best = -1;
    let bestSize = Infinity;
    let bestDeg = -1;
    for (let i = 0; i < n; i++) {
      if (assigned[i] !== -1) continue;
      const sz = size[i];
      const deg = prep.hardPairs[i].length;
      if (
        sz < bestSize ||
        (sz === bestSize && deg > bestDeg) ||
        (sz === bestSize && deg === bestDeg && tieBreak[i] < tieBreak[best])
      ) {
        best = i;
        bestSize = sz;
        bestDeg = deg;
      }
    }
    return best;
  };

  const orderValues = (i: number): number[] => {
    const vals: number[] = [];
    for (let s = 0; s < m; s++) if (dom[i * m + s]) vals.push(s);
    shuffleInPlace(vals, rng);
    if (opts.valueBias) {
      const key = new Map(vals.map((s) => [s, prep.softUnary[i * m + s] + rng() * 0.5]));
      vals.sort((a, b) => key.get(b)! - key.get(a)!);
    }
    return vals;
  };

  const solve = (depth: number): boolean => {
    if (depth === n) return true;
    tick();
    const i = selectVar();
    for (const s of orderValues(i)) {
      if (!dom[i * m + s]) continue;
      const mark = trail.length;
      let ok = true;
      for (let t = 0; t < m; t++) if (t !== s && dom[i * m + t]) remove(i, t);
      for (let j = 0; j < n && ok; j++) {
        if (j !== i && assigned[j] === -1 && dom[j * m + s]) ok = remove(j, s);
      }
      if (ok) {
        for (const link of prep.hardPairs[i]) {
          const j = link.other;
          if (assigned[j] !== -1) continue;
          for (let t = 0; t < m && ok; t++) {
            if (dom[j * m + t] && !link.compat(s, t)) ok = remove(j, t);
          }
          if (!ok) break;
        }
      }
      if (ok) ok = repairMatching();
      if (ok) {
        assigned[i] = s;
        if (solve(depth + 1)) return true;
        assigned[i] = -1;
      }
      undoTo(mark);
    }
    return false;
  };

  try {
    for (let i = 0; i < n; i++) if (size[i] === 0) return { status: 'infeasible', nodes };
    if (!repairMatching()) return { status: 'infeasible', nodes };
    if (solve(0)) return { status: 'solved', seatOf: assigned.slice(), nodes };
    return { status: 'infeasible', nodes };
  } catch (e) {
    if (e instanceof Abort) return { status: e.kind, nodes };
    throw e;
  }
}
