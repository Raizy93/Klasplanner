import type { Arrangement, ID, Plan, Rule } from '../../models/types';
import type { SeatGraph } from '../room/seatGraph';
import { needsSeat, needsSecondStudent } from './ruleMeta';

/**
 * Evaluatie van regels op een concrete indeling. Dit is de controleerbare "waarheid":
 * de generator gebruikt dezelfde semantiek, en de resultaatrapportage telt hiermee.
 */

export type RuleStatus = 'satisfied' | 'violated' | 'notApplicable';

export type NotApplicableReason = 'invalid' | 'disabled' | 'absent' | 'unplaced';

export interface RuleEvaluation {
  rule: Rule;
  status: RuleStatus;
  reason?: NotApplicableReason;
}

/** Controleert of een regel verwijst naar bestaande leerlingen/zitplaatsen. */
export function ruleValidity(rule: Rule, plan: Pick<Plan, 'students' | 'room'>): string | null {
  const ids = new Set(plan.students.map((s) => s.id));
  if (!ids.has(rule.studentA)) return 'De leerling bestaat niet meer.';
  if (needsSecondStudent(rule.type)) {
    if (!rule.studentB || !ids.has(rule.studentB)) return 'De tweede leerling bestaat niet meer.';
    if (rule.studentB === rule.studentA) return 'Een leerling kan geen regel met zichzelf hebben.';
  }
  if (needsSeat(rule.type)) {
    if (!rule.seatId || !plan.room.seats.some((s) => s.id === rule.seatId)) return 'De zitplaats bestaat niet meer.';
  }
  return null;
}

/** Kern: is de regel voldaan gegeven de zitplaatsindices (of -1 als niet geplaatst)? */
export function ruleHolds(rule: Rule, seatA: number, seatB: number, graph: SeatGraph): boolean {
  const sa = graph.seats[seatA];
  switch (rule.type) {
    case 'front':
      return sa.zones.front;
    case 'back':
      return sa.zones.back;
    case 'left':
      return sa.zones.left;
    case 'right':
      return sa.zones.right;
    case 'middle':
      return sa.zones.middle;
    case 'atSeat':
      return sa.seatId === rule.seatId;
    case 'notAtSeat':
      return sa.seatId !== rule.seatId;
    case 'beside':
      return graph.beside[seatA].includes(seatB);
    case 'notBeside':
      return !graph.beside[seatA].includes(seatB);
    case 'sameGroup':
      return sa.groupKey === graph.seats[seatB].groupKey;
    case 'notSameGroup':
      return sa.groupKey !== graph.seats[seatB].groupKey;
    case 'opposite':
      return graph.opposite[seatA].includes(seatB);
    case 'notOpposite':
      return !graph.opposite[seatA].includes(seatB);
  }
}

/** Negatieve regels ("mag niet …") zijn automatisch voldaan als één van beide leerlingen niet zit. */
export const isNegativeRule = (rule: Rule) =>
  rule.type === 'notBeside' || rule.type === 'notSameGroup' || rule.type === 'notOpposite' || rule.type === 'notAtSeat';

export function seatIndexOfStudent(arrangement: Arrangement, graph: SeatGraph): Map<ID, number> {
  const out = new Map<ID, number>();
  for (const [seatId, studentId] of Object.entries(arrangement.assignments)) {
    const idx = graph.index.get(seatId);
    if (idx !== undefined) out.set(studentId, idx);
  }
  return out;
}

export function evaluateRules(plan: Plan, graph: SeatGraph, arrangement: Arrangement = plan.arrangement): RuleEvaluation[] {
  const seatOf = seatIndexOfStudent(arrangement, graph);
  const absent = new Set(plan.students.filter((s) => s.absent).map((s) => s.id));
  return plan.rules.map((rule): RuleEvaluation => {
    if (!rule.enabled) return { rule, status: 'notApplicable', reason: 'disabled' };
    if (ruleValidity(rule, plan)) return { rule, status: 'notApplicable', reason: 'invalid' };
    const pair = needsSecondStudent(rule.type);
    if (absent.has(rule.studentA) || (pair && absent.has(rule.studentB!))) {
      return { rule, status: 'notApplicable', reason: 'absent' };
    }
    const a = seatOf.get(rule.studentA);
    const b = pair ? seatOf.get(rule.studentB!) : 0;
    if (a === undefined || b === undefined) {
      if (isNegativeRule(rule)) return { rule, status: 'satisfied' };
      return { rule, status: 'notApplicable', reason: 'unplaced' };
    }
    return { rule, status: ruleHolds(rule, a, b, graph) ? 'satisfied' : 'violated' };
  });
}

export interface EvaluationSummary {
  hardTotal: number;
  hardSatisfied: number;
  hardViolated: RuleEvaluation[];
  softTotal: number;
  softSatisfied: number;
  softUnmet: RuleEvaluation[];
  notApplicable: RuleEvaluation[];
}

export function summarize(evals: RuleEvaluation[]): EvaluationSummary {
  const active = evals.filter((e) => e.status !== 'notApplicable');
  const hard = active.filter((e) => e.rule.priority === 'hard');
  const soft = active.filter((e) => e.rule.priority === 'soft');
  return {
    hardTotal: hard.length,
    hardSatisfied: hard.filter((e) => e.status === 'satisfied').length,
    hardViolated: hard.filter((e) => e.status === 'violated'),
    softTotal: soft.length,
    softSatisfied: soft.filter((e) => e.status === 'satisfied').length,
    softUnmet: soft.filter((e) => e.status === 'violated'),
    notApplicable: evals.filter((e) => e.status === 'notApplicable' && e.reason !== 'disabled'),
  };
}
