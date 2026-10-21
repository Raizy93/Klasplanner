import { PALETTE } from '../../models/constants';
import type { Arrangement, ID, Plan, Rule, Student } from '../../models/types';
import { createId } from '../../utils/id';
import { needsSecondStudent } from '../rules/ruleMeta';
import { removeDesks } from '../room/roomOps';
import { removeStudentFromSociogram } from '../sociogram/sociogramOps';

/**
 * Bewerkingen op een plattegrond (leerlingen, regels, indeling).
 * Alle functies muteren het meegegeven `plan` en zijn bedoeld voor gebruik binnen een immer-producer.
 */

// ---------- Leerlingen ----------

export function addStudent(plan: Plan, name: string): Student {
  const student: Student = {
    id: createId('stu'),
    name: name.trim(),
    color: plan.students.length % PALETTE.length,
    absent: false,
    createdAt: Date.now(),
  };
  plan.students.push(student);
  return student;
}

export interface BulkParseResult {
  names: string[];
  emptyLines: number;
  /** Namen die al in de klas voorkomen of dubbel in de lijst staan. */
  duplicates: string[];
}

/** Leest een geplakte namenlijst: één naam per regel, lege regels worden genegeerd. */
export function parseNameList(text: string, existing: string[]): BulkParseResult {
  const lines = text.split(/\r?\n/);
  const names: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set(existing.map((n) => n.trim().toLocaleLowerCase('nl')));
  let emptyLines = 0;
  for (const line of lines) {
    const name = line.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) {
      emptyLines++;
      continue;
    }
    const key = name.toLocaleLowerCase('nl');
    if (seen.has(key)) duplicates.push(name);
    seen.add(key);
    names.push(name);
  }
  return { names, emptyLines, duplicates };
}

export function renameStudent(plan: Plan, id: ID, name: string): void {
  const s = plan.students.find((x) => x.id === id);
  if (s && name.trim()) s.name = name.trim().slice(0, 60);
}

export function setStudentAbsent(plan: Plan, id: ID, absent: boolean): void {
  const s = plan.students.find((x) => x.id === id);
  // De bestaande indeling blijft bewust intact: een afwezige leerling houdt zijn plek
  // in de huidige plattegrond; alleen bij een nieuwe generatie telt hij niet mee.
  if (s) s.absent = absent;
}

/** Regels die naar een leerling verwijzen. */
export function rulesForStudent(plan: Plan, id: ID): Rule[] {
  return plan.rules.filter((r) => r.studentA === id || (needsSecondStudent(r.type) && r.studentB === id));
}

/** Verwijdert een leerling, inclusief zijn regels, zitplaats, vergrendeling en sociogramkeuzes. */
export function removeStudent(plan: Plan, id: ID): void {
  plan.students = plan.students.filter((s) => s.id !== id);
  const ruleIds = new Set(rulesForStudent(plan, id).map((r) => r.id));
  plan.rules = plan.rules.filter((r) => !ruleIds.has(r.id));
  unassignStudent(plan.arrangement, id);
  removeStudentFromSociogram(plan.sociogram, id);
}

// ---------- Indeling ----------

export function seatOfStudent(arrangement: Arrangement, studentId: ID): ID | null {
  for (const [seatId, sid] of Object.entries(arrangement.assignments)) if (sid === studentId) return seatId;
  return null;
}

export function unassignStudent(arrangement: Arrangement, studentId: ID): void {
  for (const [seatId, sid] of Object.entries(arrangement.assignments)) {
    if (sid === studentId) delete arrangement.assignments[seatId];
  }
  arrangement.locked = arrangement.locked.filter((x) => x !== studentId);
}

/**
 * Zet een leerling op een zitplaats. Zit daar al iemand, dan wisselen de twee van plek
 * (of gaat de ander naar "niet geplaatst" als de leerling nog geen plek had).
 * Retourneert de leerling die daardoor verschoven is (of null).
 */
export function assignStudent(plan: Plan, studentId: ID, seatId: ID): ID | null {
  const a = plan.arrangement;
  if (!plan.room.seats.some((s) => s.id === seatId)) return null;
  const fromSeat = seatOfStudent(a, studentId);
  if (fromSeat === seatId) return null;
  const other = a.assignments[seatId] ?? null;
  if (fromSeat) delete a.assignments[fromSeat];
  a.assignments[seatId] = studentId;
  if (other && other !== studentId) {
    if (fromSeat) a.assignments[fromSeat] = other;
    else a.locked = a.locked.filter((x) => x !== other);
  }
  return other;
}

export function toggleLock(plan: Plan, studentId: ID): void {
  const a = plan.arrangement;
  if (a.locked.includes(studentId)) a.locked = a.locked.filter((x) => x !== studentId);
  else if (seatOfStudent(a, studentId)) a.locked.push(studentId);
}

export function clearArrangement(plan: Plan, keepLocked: boolean): void {
  const a = plan.arrangement;
  const locked = new Set(a.locked);
  for (const [seatId, sid] of Object.entries(a.assignments)) {
    if (!keepLocked || !locked.has(sid)) delete a.assignments[seatId];
  }
  if (!keepLocked) a.locked = [];
}

/** Verwijdert tafels én ruimt de indeling op (leerlingen op die tafels worden "niet geplaatst"). */
export function removeDesksFromPlan(plan: Plan, deskIds: ID[]): ID[] {
  const removedSeats = removeDesks(plan.room, deskIds);
  for (const seatId of removedSeats) {
    const sid = plan.arrangement.assignments[seatId];
    if (sid) unassignStudent(plan.arrangement, sid);
  }
  return removedSeats;
}

// ---------- Regels ----------

export type RuleInput = Omit<Rule, 'id' | 'createdAt'>;

export function addRule(plan: Plan, input: RuleInput): Rule {
  const rule: Rule = { ...input, id: createId('rule'), createdAt: Date.now() };
  if (!needsSecondStudent(rule.type)) delete rule.studentB;
  if (rule.type !== 'atSeat' && rule.type !== 'notAtSeat') delete rule.seatId;
  plan.rules.push(rule);
  return rule;
}

export function updateRule(plan: Plan, id: ID, input: Partial<RuleInput>): void {
  const r = plan.rules.find((x) => x.id === id);
  if (!r) return;
  Object.assign(r, input);
  if (!needsSecondStudent(r.type)) delete r.studentB;
  if (r.type !== 'atSeat' && r.type !== 'notAtSeat') delete r.seatId;
}

export function removeRule(plan: Plan, id: ID): void {
  plan.rules = plan.rules.filter((r) => r.id !== id);
}
