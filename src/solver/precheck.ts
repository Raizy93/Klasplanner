import type { RuleType } from '../models/types';
import { isUnary, prepare, unaryHolds } from './prepare';
import { findHallViolation } from './search';
import type { Conflict, Constraint, Problem } from './types';

/**
 * Voorafgaande controles die aantoonbare conflicten opsporen vóórdat er gezocht wordt.
 * Iedere melding hier is bewezen: de genoemde beperkingen kunnen echt niet tegelijk gelden.
 */

const CONTRADICTING: [RuleType, RuleType][] = [
  ['beside', 'notBeside'],
  ['sameGroup', 'notSameGroup'],
  ['opposite', 'notOpposite'],
  ['beside', 'opposite'],
  ['beside', 'notSameGroup'],
  ['opposite', 'notSameGroup'],
];

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
}

export function precheck(p: Problem): Conflict[] {
  const conflicts: Conflict[] = [];
  const n = p.studentIds.length;
  const m = p.seatIds.length;
  const name = (i: number) => p.studentNames[i];
  const hard = p.constraints.map((c, i) => ({ c, i })).filter((x) => x.c.hard);
  const availableCount = p.available.filter(Boolean).length;

  // 1. Capaciteit.
  if (n > availableCount) {
    conflicts.push({
      kind: 'capacity',
      message: `Er zijn ${n} aanwezige leerlingen, maar slechts ${availableCount} beschikbare zitplaatsen. Voeg tafels toe of markeer leerlingen als afwezig.`,
      keys: [],
    });
    return conflicts;
  }

  // 2. Rechtstreeks tegenstrijdige regels voor hetzelfde paar.
  const byPair = new Map<string, Constraint[]>();
  for (const { c } of hard) {
    if (isUnary(c)) continue;
    const k = pairKey(c.a, c.b);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(c);
  }
  const reported = new Set<string>();
  for (const list of byPair.values()) {
    for (const [t1, t2] of CONTRADICTING) {
      const c1 = list.find((c) => c.type === t1);
      const c2 = list.find((c) => c.type === t2);
      if (c1 && c2) {
        const id = [c1.key, c2.key].sort().join('|');
        if (reported.has(id)) continue;
        reported.add(id);
        conflicts.push({
          kind: 'contradiction',
          message: `Er is geen geldige indeling mogelijk: "${c1.label}" en "${c2.label}" spreken elkaar tegen.`,
          keys: [c1.key, c2.key],
        });
      }
    }
  }

  // 3. Twee leerlingen verplicht op dezelfde zitplaats.
  const atSeat = new Map<number, Constraint[]>();
  for (const { c } of hard) {
    if (c.type !== 'atSeat') continue;
    if (!atSeat.has(c.seat)) atSeat.set(c.seat, []);
    atSeat.get(c.seat)!.push(c);
  }
  for (const [seat, list] of atSeat) {
    const students = [...new Set(list.map((c) => c.a))];
    if (students.length > 1) {
      conflicts.push({
        kind: 'seatTaken',
        message: `Zitplaats ${p.seatNumbers[seat]} is vergrendeld voor meerdere leerlingen tegelijk (${listNames(students.map(name))}).`,
        keys: list.map((c) => c.key),
      });
    }
  }

  // 4. Lege domeinen per leerling (alleen unaire regels + beschikbaarheid).
  const unaryByStudent = new Map<number, Constraint[]>();
  for (const { c } of hard) {
    if (!isUnary(c)) continue;
    if (!unaryByStudent.has(c.a)) unaryByStudent.set(c.a, []);
    unaryByStudent.get(c.a)!.push(c);
  }
  const domainOf = (cs: Constraint[]) => {
    const seats: number[] = [];
    for (let s = 0; s < m; s++) {
      if (p.available[s] && cs.every((c) => unaryHolds(c.type, s, c.seat, p))) seats.push(s);
    }
    return seats;
  };
  const emptyStudents = new Set<number>();
  for (const [a, cs] of unaryByStudent) {
    if (domainOf(cs).length > 0) continue;
    emptyStudents.add(a);
    // Deletion filter: zoek een minimale set regels die samen geen plek overlaten.
    let core = [...cs];
    for (const c of cs) {
      const without = core.filter((x) => x !== c);
      if (without.length > 0 && domainOf(without).length === 0) core = without;
    }
    const why =
      core.length === 1
        ? core[0].type === 'atSeat'
          ? `de zitplaats is niet beschikbaar`
          : `er is geen beschikbare zitplaats in die zone`
        : `deze regels laten samen geen enkele zitplaats over`;
    conflicts.push({
      kind: 'emptyDomain',
      message: `Voor ${name(a)} is geen geldige zitplaats: ${why}.`,
      keys: core.map((c) => c.key),
    });
  }

  // 5. Hall: groep leerlingen met samen te weinig mogelijke zitplaatsen.
  if (emptyStudents.size === 0) {
    const prep = prepare(p);
    const hall = findHallViolation(prep.baseDomains, n, m);
    if (hall) {
      const keys = hall.students.flatMap((s) => (unaryByStudent.get(s) ?? []).map((c) => c.key));
      conflicts.push({
        kind: 'hall',
        message: `${listNames(hall.students.map(name))} hebben samen ${hall.students.length} zitplaatsen nodig, maar volgens hun regels komen er maar ${hall.seats.length} in aanmerking.`,
        keys,
      });
    }
  }

  // 6. Ketens van "zelfde groepje" botsen met "niet in hetzelfde groepje" of zijn te groot.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const sameEdges: Constraint[] = [];
  for (const { c } of hard) {
    if (c.type === 'sameGroup' || c.type === 'beside' || c.type === 'opposite') {
      sameEdges.push(c);
      parent[find(c.a)] = find(c.b);
    }
  }
  const pathKeys = (from: number, to: number): string[] | null => {
    // BFS over de "samen"-regels om de keten te vinden.
    const prev = new Map<number, Constraint>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const x = queue.shift()!;
      if (x === to) break;
      for (const e of sameEdges) {
        const y = e.a === x ? e.b : e.b === x ? e.a : -1;
        if (y >= 0 && !seen.has(y)) {
          seen.add(y);
          prev.set(y, e);
          queue.push(y);
        }
      }
    }
    if (!seen.has(to)) return null;
    const keys: string[] = [];
    let cur = to;
    while (cur !== from) {
      const e = prev.get(cur)!;
      keys.push(e.key);
      cur = e.a === cur ? e.b : e.a;
    }
    return keys;
  };
  for (const { c } of hard) {
    if (c.type !== 'notSameGroup' || find(c.a) !== find(c.b)) continue;
    const chain = pathKeys(c.a, c.b);
    if (!chain || chain.length < 2) continue; // directe tegenspraak is al gemeld
    conflicts.push({
      kind: 'groupChain',
      message: `${name(c.a)} en ${name(c.b)} mogen niet in hetzelfde groepje, maar via andere regels moeten ze wel in hetzelfde groepje komen.`,
      keys: [c.key, ...chain],
    });
  }
  const groupCap = new Map<number, number>();
  p.groupOf.forEach((g, s) => p.available[s] && groupCap.set(g, (groupCap.get(g) ?? 0) + 1));
  const maxCap = Math.max(0, ...groupCap.values());
  const comps = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(i);
  }
  for (const members of comps.values()) {
    if (members.length > 1 && members.length > maxCap) {
      const set = new Set(members);
      conflicts.push({
        kind: 'groupTooLarge',
        message: `${listNames(members.map(name))} moeten samen in één groepje, maar het grootste groepje heeft ${maxCap} beschikbare plaatsen.`,
        keys: sameEdges.filter((e) => set.has(e.a)).map((e) => e.key),
      });
    }
  }

  // 7. Te veel verplichte buren voor één leerling.
  const maxDegree = (lists: number[][]) =>
    Math.max(0, ...lists.map((l, s) => (p.available[s] ? l.filter((t) => p.available[t]).length : 0)));
  const degreeCheck = (type: RuleType, lists: number[][], what: string) => {
    const max = maxDegree(lists);
    const per = new Map<number, Constraint[]>();
    for (const { c } of hard) {
      if (c.type !== type) continue;
      for (const x of [c.a, c.b]) {
        if (!per.has(x)) per.set(x, []);
        per.get(x)!.push(c);
      }
    }
    for (const [x, cs] of per) {
      const partners = new Set(cs.map((c) => (c.a === x ? c.b : c.a)));
      if (partners.size > max) {
        conflicts.push({
          kind: 'degree',
          message:
            max === 0
              ? `${name(x)} moet ${what} iemand zitten, maar in dit lokaal zijn geen zitplaatsen die ${what} elkaar liggen. Koppel tafels tot groepjes.`
              : `${name(x)} moet ${what} ${partners.size} leerlingen zitten, maar een zitplaats heeft maximaal ${max} ${type === 'beside' ? 'buren' : 'plaatsen tegenover zich'}.`,
          keys: cs.map((c) => c.key),
        });
      }
    }
  };
  degreeCheck('beside', p.beside, 'naast');
  degreeCheck('opposite', p.opposite, 'tegenover');

  return conflicts;
}
