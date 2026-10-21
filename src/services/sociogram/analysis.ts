import type { ID, Plan, SocioDimension } from '../../models/types';

/**
 * Analyse van het sociogram per vraag (samenwerken of spelen).
 *
 * Sociometrische status volgens de gangbare methode van Coie, Dodge & Coppotelli (1982):
 *  - per leerling het aandeel positieve (LM) en negatieve (LL) keuzes dat hij of zij ontvangt,
 *    gedeeld door het aantal klasgenoten dat het formulier invulde (zodat afwezigen niet meetellen);
 *  - LM en LL worden binnen de klas gestandaardiseerd (z-scores);
 *  - sociale voorkeur SP = zLM − zLL en sociale impact SI = zLM + zLL (opnieuw gestandaardiseerd);
 *  - populair:       SP > 1,  zLM > 0, zLL < 0
 *    afgewezen:      SP < −1, zLL > 0, zLM < 0
 *    genegeerd:      SI < −1, zLM < 0, zLL < 0
 *    controversieel: SI > 1,  zLM > 0, zLL > 0
 *    overig:         gemiddeld / niet opvallend.
 * Dit is een indicatie op basis van één momentopname, geen diagnose.
 */

export type SocioStatus = 'popular' | 'rejected' | 'neglected' | 'controversial' | 'average';

export const STATUS_LABELS: Record<SocioStatus, string> = {
  popular: 'Populair',
  rejected: 'Afgewezen',
  neglected: 'Genegeerd',
  controversial: 'Controversieel',
  average: 'Niet opvallend',
};

export const STATUS_DESCRIPTIONS: Record<SocioStatus, string> = {
  popular: 'Wordt vaak positief en zelden negatief gekozen.',
  rejected: 'Wordt vaak negatief en zelden positief gekozen.',
  neglected: 'Wordt weinig gekozen, positief én negatief: valt nauwelijks op in de groep.',
  controversial: 'Wordt zowel vaak positief als vaak negatief gekozen.',
  average: 'Geen opvallende positie in de groep.',
};

/** Minimaal aantal ingevulde formulieren voordat statussen worden berekend. */
export const MIN_RESPONDENTS_FOR_STATUS = 5;

export interface SocioStudentStats {
  id: ID;
  filledIn: boolean;
  posIn: number;
  negIn: number;
  posOut: number;
  negOut: number;
  mutualPos: number;
  mutualNeg: number;
  status: SocioStatus | null;
  /** Ontvangen positieve keuzes als aandeel van het aantal kiezers. */
  lm: number;
  ll: number;
}

export interface Pair {
  a: ID;
  b: ID;
}

export interface DirectedPair {
  from: ID;
  to: ID;
}

export interface SocioAnalysis {
  dimension: SocioDimension;
  respondents: number;
  total: number;
  statusAvailable: boolean;
  stats: Map<ID, SocioStudentStats>;
  /** Kiezen elkaar allebei positief. */
  mutualPos: Pair[];
  /** Kiezen elkaar allebei negatief. */
  mutualNeg: Pair[];
  /** `from` kiest `to` positief, maar `to` kiest `from` negatief. */
  conflicting: DirectedPair[];
  /** `from` kiest `to` positief; `to` heeft ingevuld maar koos `from` niet. */
  oneSidedPos: DirectedPair[];
  /** `from` kiest `to` negatief; `to` heeft ingevuld maar koos `from` niet. */
  oneSidedNeg: DirectedPair[];
  /** Hechte groepjes: 3 of meer leerlingen die elkaar allemaal wederzijds positief kiezen. */
  clusters: ID[][];
  /** Leerlingen die geen enkele positieve keuze ontvangen (alleen zinvol bij genoeg respondenten). */
  noPositive: ID[];
}

function zScores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return values.map((v) => (sd < 1e-9 ? 0 : (v - mean) / sd));
}

export function classify(zLM: number, zLL: number, zSP: number, zSI: number): SocioStatus {
  if (zSP > 1 && zLM > 0 && zLL < 0) return 'popular';
  if (zSP < -1 && zLL > 0 && zLM < 0) return 'rejected';
  if (zSI < -1 && zLM < 0 && zLL < 0) return 'neglected';
  if (zSI > 1 && zLM > 0 && zLL > 0) return 'controversial';
  return 'average';
}

export function analyzeSociogram(plan: Pick<Plan, 'students' | 'sociogram'>, dimension: SocioDimension): SocioAnalysis {
  const ids = plan.students.map((s) => s.id);
  const idSet = new Set(ids);
  const responses = plan.sociogram.responses;
  const respondents = new Set(Object.keys(responses).filter((id) => idSet.has(id)));
  const posKey = dimension === 'work' ? 'workPos' : 'playPos';
  const negKey = dimension === 'work' ? 'workNeg' : 'playNeg';

  const pos = new Map<ID, Set<ID>>();
  const neg = new Map<ID, Set<ID>>();
  for (const id of respondents) {
    const r = responses[id];
    pos.set(id, new Set(r[posKey].filter((x) => x !== id && idSet.has(x))));
    neg.set(id, new Set(r[negKey].filter((x) => x !== id && idSet.has(x) && !r[posKey].includes(x))));
  }
  const choosesPos = (a: ID, b: ID) => !!pos.get(a)?.has(b);
  const choosesNeg = (a: ID, b: ID) => !!neg.get(a)?.has(b);

  const stats = new Map<ID, SocioStudentStats>();
  for (const id of ids) {
    let posIn = 0;
    let negIn = 0;
    let mutualPos = 0;
    let mutualNeg = 0;
    for (const other of respondents) {
      if (other === id) continue;
      if (choosesPos(other, id)) {
        posIn++;
        if (choosesPos(id, other)) mutualPos++;
      }
      if (choosesNeg(other, id)) {
        negIn++;
        if (choosesNeg(id, other)) mutualNeg++;
      }
    }
    const voters = respondents.size - (respondents.has(id) ? 1 : 0);
    stats.set(id, {
      id,
      filledIn: respondents.has(id),
      posIn,
      negIn,
      posOut: pos.get(id)?.size ?? 0,
      negOut: neg.get(id)?.size ?? 0,
      mutualPos,
      mutualNeg,
      status: null,
      lm: voters > 0 ? posIn / voters : 0,
      ll: voters > 0 ? negIn / voters : 0,
    });
  }

  const statusAvailable = respondents.size >= MIN_RESPONDENTS_FOR_STATUS && ids.length >= 3;
  if (statusAvailable) {
    const list = ids.map((id) => stats.get(id)!);
    const zLM = zScores(list.map((s) => s.lm));
    const zLL = zScores(list.map((s) => s.ll));
    const zSP = zScores(list.map((_, i) => zLM[i] - zLL[i]));
    const zSI = zScores(list.map((_, i) => zLM[i] + zLL[i]));
    list.forEach((s, i) => (s.status = classify(zLM[i], zLL[i], zSP[i], zSI[i])));
  }

  const mutualPos: Pair[] = [];
  const mutualNeg: Pair[] = [];
  const conflicting: DirectedPair[] = [];
  const oneSidedPos: DirectedPair[] = [];
  const oneSidedNeg: DirectedPair[] = [];
  const order = new Map(ids.map((id, i) => [id, i]));
  for (const a of respondents) {
    for (const b of pos.get(a)!) {
      if (choosesPos(b, a)) {
        if (order.get(a)! < order.get(b)!) mutualPos.push({ a, b });
      } else if (choosesNeg(b, a)) conflicting.push({ from: a, to: b });
      else if (respondents.has(b)) oneSidedPos.push({ from: a, to: b });
    }
    for (const b of neg.get(a)!) {
      if (choosesNeg(b, a)) {
        if (order.get(a)! < order.get(b)!) mutualNeg.push({ a, b });
      } else if (!choosesPos(b, a) && respondents.has(b)) oneSidedNeg.push({ from: a, to: b });
    }
  }

  // Hechte groepjes: maximale cliques (≥ 3) in de graaf van wederzijds positieve keuzes,
  // dus groepjes waarin iedereen elkaar wederzijds kiest (Bron–Kerbosch met pivot).
  const adj = new Map<ID, Set<ID>>(ids.map((id) => [id, new Set<ID>()]));
  for (const { a, b } of mutualPos) {
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const clusters: ID[][] = [];
  const bronKerbosch = (r: ID[], p: Set<ID>, x: Set<ID>) => {
    if (p.size === 0 && x.size === 0) {
      if (r.length >= 3) clusters.push([...r].sort((m, n) => order.get(m)! - order.get(n)!));
      return;
    }
    const pivot = [...p, ...x].reduce((best, v) => (adj.get(v)!.size > adj.get(best)!.size ? v : best));
    for (const v of [...p].filter((v) => !adj.get(pivot)!.has(v))) {
      const nv = adj.get(v)!;
      bronKerbosch([...r, v], new Set([...p].filter((w) => nv.has(w))), new Set([...x].filter((w) => nv.has(w))));
      p.delete(v);
      x.add(v);
    }
  };
  bronKerbosch([], new Set(ids.filter((id) => adj.get(id)!.size > 0)), new Set());
  clusters.sort((m, n) => n.length - m.length);

  const noPositive = respondents.size >= MIN_RESPONDENTS_FOR_STATUS ? ids.filter((id) => stats.get(id)!.posIn === 0) : [];

  return {
    dimension,
    respondents: respondents.size,
    total: ids.length,
    statusAvailable,
    stats,
    mutualPos,
    mutualNeg,
    conflicting,
    oneSidedPos,
    oneSidedNeg,
    clusters,
    noPositive,
  };
}
