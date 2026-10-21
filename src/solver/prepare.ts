import type { RuleType } from '../models/types';
import type { Constraint, Problem } from './types';

export type Compat = (s: number, t: number) => boolean;

export interface PairLink {
  other: number;
  compat: Compat;
  constraint: number;
}

/**
 * Voorbewerkte structuren voor snelle evaluatie. `active` bepaalt welke harde beperkingen meetellen
 * (gebruikt bij het opsporen van een minimale conflictverzameling).
 */
export interface Prepared {
  n: number;
  m: number;
  /** Domeinen na unaire harde beperkingen: dom[i*m+s] = 1 als leerling i op zitplaats s mag. */
  baseDomains: Uint8Array;
  /** Binaire harde beperkingen per leerling. */
  hardPairs: PairLink[][];
  /** Zachte unaire waarde per leerling/zitplaats (som van gewichten van voldane voorkeuren). */
  softUnary: Float64Array;
  /** Zachte paarbeperkingen per leerling. */
  softPairs: PairLink[][];
  softPairList: { a: number; b: number; compat: Compat; weight: number }[];
  softMax: number;
}

export function unaryHolds(type: RuleType, s: number, seatParam: number, p: Problem): boolean {
  const z = p.zones[s];
  switch (type) {
    case 'front':
      return z.front;
    case 'back':
      return z.back;
    case 'left':
      return z.left;
    case 'right':
      return z.right;
    case 'middle':
      return z.middle;
    case 'atSeat':
      return s === seatParam;
    case 'notAtSeat':
      return s !== seatParam;
    default:
      return true;
  }
}

export const isUnary = (c: Constraint) => c.b < 0;

export function makeCompat(type: RuleType, p: Problem): Compat {
  const m = p.seatIds.length;
  const besideM = new Uint8Array(m * m);
  const oppM = new Uint8Array(m * m);
  p.beside.forEach((list, s) => list.forEach((t) => (besideM[s * m + t] = 1)));
  p.opposite.forEach((list, s) => list.forEach((t) => (oppM[s * m + t] = 1)));
  const g = p.groupOf;
  switch (type) {
    case 'beside':
      return (s, t) => besideM[s * m + t] === 1;
    case 'notBeside':
      return (s, t) => besideM[s * m + t] === 0;
    case 'opposite':
      return (s, t) => oppM[s * m + t] === 1;
    case 'notOpposite':
      return (s, t) => oppM[s * m + t] === 0;
    case 'sameGroup':
      return (s, t) => g[s] === g[t];
    case 'notSameGroup':
      return (s, t) => g[s] !== g[t];
    default:
      return () => true;
  }
}

export function prepare(p: Problem, active?: boolean[]): Prepared {
  const n = p.studentIds.length;
  const m = p.seatIds.length;
  const baseDomains = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) for (let s = 0; s < m; s++) baseDomains[i * m + s] = p.available[s] ? 1 : 0;

  const hardPairs: PairLink[][] = Array.from({ length: n }, () => []);
  const softPairs: PairLink[][] = Array.from({ length: n }, () => []);
  const softPairList: Prepared['softPairList'] = [];
  const softUnary = new Float64Array(n * m);
  const compatCache = new Map<RuleType, Compat>();
  const compatOf = (t: RuleType) => {
    let c = compatCache.get(t);
    if (!c) {
      c = makeCompat(t, p);
      compatCache.set(t, c);
    }
    return c;
  };
  let softMax = 0;

  p.constraints.forEach((c, ci) => {
    if (c.hard && active && !active[ci]) return;
    if (isUnary(c)) {
      if (c.hard) {
        for (let s = 0; s < m; s++) if (!unaryHolds(c.type, s, c.seat, p)) baseDomains[c.a * m + s] = 0;
      } else {
        softMax += c.weight;
        for (let s = 0; s < m; s++) if (unaryHolds(c.type, s, c.seat, p)) softUnary[c.a * m + s] += c.weight;
      }
    } else {
      const compat = compatOf(c.type);
      if (c.hard) {
        hardPairs[c.a].push({ other: c.b, compat, constraint: ci });
        // Alle paarrelaties zijn symmetrisch (naast, tegenover, groepje).
        hardPairs[c.b].push({ other: c.a, compat, constraint: ci });
      } else {
        softMax += c.weight;
        softPairs[c.a].push({ other: c.b, compat, constraint: ci });
        softPairs[c.b].push({ other: c.a, compat, constraint: ci });
        softPairList.push({ a: c.a, b: c.b, compat, weight: c.weight });
      }
    }
  });

  return { n, m, baseDomains, hardPairs, softUnary, softPairs, softPairList, softMax };
}

/** Totale voorkeursscore van een volledige toewijzing. */
export function softScore(prep: Prepared, seatOf: ArrayLike<number>): number {
  let score = 0;
  for (let i = 0; i < prep.n; i++) if (seatOf[i] >= 0) score += prep.softUnary[i * prep.m + seatOf[i]];
  for (const sp of prep.softPairList) {
    const s = seatOf[sp.a];
    const t = seatOf[sp.b];
    if (s >= 0 && t >= 0 && sp.compat(s, t)) score += sp.weight;
  }
  return score;
}

/** Voldoet een toewijzing aan alle (actieve) harde beperkingen? */
export function satisfiesHard(prep: Prepared, seatOf: ArrayLike<number>): boolean {
  const used = new Set<number>();
  for (let i = 0; i < prep.n; i++) {
    const s = seatOf[i];
    if (s < 0 || !prep.baseDomains[i * prep.m + s] || used.has(s)) return false;
    used.add(s);
    for (const link of prep.hardPairs[i]) if (!link.compat(s, seatOf[link.other])) return false;
  }
  return true;
}
