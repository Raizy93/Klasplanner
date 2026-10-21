import type { ID, Plan, Rule } from '../../models/types';
import type { SeatGraph } from '../room/seatGraph';
import { ruleValidity } from '../rules/evaluate';
import { describeRule, needsSecondStudent, needsSeat, STRENGTH_WEIGHTS, type NameLookup } from '../rules/ruleMeta';
import type { Constraint, Problem } from '../../solver/types';

export interface SkippedRule {
  rule: Rule;
  reason: 'invalid' | 'absent';
  detail: string;
}

export interface BuiltProblem {
  problem: Problem;
  skipped: SkippedRule[];
  /** Afwezige, vastgezette leerlingen: hun zitplaats blijft voor hen gereserveerd. */
  reserved: { seatId: ID; studentId: ID }[];
}

export function nameLookup(plan: Plan): NameLookup {
  const students = new Map(plan.students.map((s) => [s.id, s.name]));
  const seats = new Map(plan.room.seats.map((s) => [s.id, s.number]));
  return {
    student: (id) => (id && students.get(id)) || '(verwijderde leerling)',
    seat: (id) => (id && seats.has(id) ? String(seats.get(id)) : '(verwijderd)'),
  };
}

export interface BuildOptions {
  /** Eerdere indelingen (zitplaats-ID → leerling-ID), recentste eerst. */
  history?: Record<ID, ID>[];
}

export function buildProblem(plan: Plan, graph: SeatGraph, opts: BuildOptions = {}): BuiltProblem {
  const settings = plan.settings;
  const present = plan.students.filter((s) => !s.absent);
  const studentIndex = new Map(present.map((s, i) => [s.id, i]));
  const absentIds = new Set(plan.students.filter((s) => s.absent).map((s) => s.id));
  const names = nameLookup(plan);

  const groupKeys = new Map<string, number>();
  const groupOf = graph.seats.map((s) => {
    if (!groupKeys.has(s.groupKey)) groupKeys.set(s.groupKey, groupKeys.size);
    return groupKeys.get(s.groupKey)!;
  });
  const available = graph.seats.map((s) => !s.disabled);

  const constraints: Constraint[] = [];
  const skipped: SkippedRule[] = [];
  const reserved: BuiltProblem['reserved'] = [];

  // Vastgezette leerlingen.
  if (settings.keepLocked) {
    const seatOfStudent = new Map<ID, ID>();
    for (const [seatId, studentId] of Object.entries(plan.arrangement.assignments)) seatOfStudent.set(studentId, seatId);
    for (const studentId of plan.arrangement.locked) {
      const seatId = seatOfStudent.get(studentId);
      const seatIdx = seatId !== undefined ? graph.index.get(seatId) : undefined;
      if (seatIdx === undefined) continue;
      if (absentIds.has(studentId)) {
        reserved.push({ seatId: seatId!, studentId });
        available[seatIdx] = false;
        continue;
      }
      const a = studentIndex.get(studentId);
      if (a === undefined) continue;
      constraints.push({
        key: `lock:${studentId}`,
        source: 'lock',
        type: 'atSeat',
        a,
        b: -1,
        seat: seatIdx,
        hard: true,
        weight: 0,
        label: `${names.student(studentId)} is vastgezet op zitplaats ${graph.seats[seatIdx].number}`,
      });
    }
  }

  for (const rule of plan.rules) {
    if (!rule.enabled) continue;
    const invalid = ruleValidity(rule, plan);
    if (invalid) {
      skipped.push({ rule, reason: 'invalid', detail: invalid });
      continue;
    }
    const pair = needsSecondStudent(rule.type);
    if (absentIds.has(rule.studentA) || (pair && absentIds.has(rule.studentB!))) {
      skipped.push({ rule, reason: 'absent', detail: 'Een betrokken leerling is afwezig.' });
      continue;
    }
    const seatIdx = needsSeat(rule.type) ? graph.index.get(rule.seatId!) : -1;
    if (seatIdx === undefined) {
      skipped.push({ rule, reason: 'invalid', detail: 'De zitplaats bestaat niet meer.' });
      continue;
    }
    constraints.push({
      key: rule.id,
      source: 'rule',
      ruleId: rule.id,
      type: rule.type,
      a: studentIndex.get(rule.studentA)!,
      b: pair ? studentIndex.get(rule.studentB!)! : -1,
      seat: seatIdx,
      hard: rule.priority === 'hard',
      weight: rule.priority === 'soft' ? STRENGTH_WEIGHTS[rule.strength] : 0,
      label: describeRule(rule, names),
    });
  }

  const seatIdxOf = (seatId: ID) => graph.index.get(seatId) ?? -1;
  const previous = (opts.history ?? []).slice(0, 6).map((assign) => {
    const arr = new Array<number>(present.length).fill(-1);
    for (const [seatId, studentId] of Object.entries(assign)) {
      const i = studentIndex.get(studentId);
      if (i !== undefined) arr[i] = seatIdxOf(seatId);
    }
    return arr;
  });

  const extra = settings.extraVariation;
  const problem: Problem = {
    seatIds: graph.seats.map((s) => s.seatId),
    seatNumbers: graph.seats.map((s) => s.number),
    groupOf,
    beside: graph.beside,
    opposite: graph.opposite,
    zones: graph.seats.map((s) => s.zones),
    available,
    studentIds: present.map((s) => s.id),
    studentNames: present.map((s) => s.name),
    constraints,
    previous,
    // Zonder "extra variatie" is de straf per herhaling kleiner dan de lichtste voorkeur (gewicht 1),
    // zodat voorkeuren in de praktijk voorgaan op variatie.
    variation: extra ? { seatRepeat: 1.2, pairRepeat: 0.7 } : { seatRepeat: 0.3, pairRepeat: 0.08 },
    optimizePreferences: settings.optimizePreferences,
  };
  return { problem, skipped, reserved };
}

/** Zet een solver-oplossing om naar zitplaats-ID → leerling-ID. */
export function toAssignments(problem: Problem, seatOf: number[], reserved: BuiltProblem['reserved']): Record<ID, ID> {
  const out: Record<ID, ID> = {};
  seatOf.forEach((s, i) => {
    if (s >= 0) out[problem.seatIds[s]] = problem.studentIds[i];
  });
  for (const r of reserved) out[r.seatId] = r.studentId;
  return out;
}
