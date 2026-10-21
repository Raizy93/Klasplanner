import type { Plan, RuleType } from '../src/models/types';
import { buildProblem } from '../src/services/generator/buildProblem';
import { addRule, addStudent } from '../src/services/plan/planOps';
import { createEmptyPlan } from '../src/services/plan/planFactory';
import { addGroupFromTemplate, GROUP_TEMPLATES } from '../src/services/room/roomOps';
import { buildSeatGraph } from '../src/services/room/seatGraph';
import { solve } from '../src/solver/solve';
import type { SolveOptions } from '../src/solver/types';

/** Plattegrond met `groups` groepjes van 4 (2 kolommen) en `students` leerlingen L1..Ln. */
export function makePlan(students: number, groups = 6): Plan {
  const plan = createEmptyPlan('Test');
  const cols = [250, 570];
  for (let g = 0; g < groups; g++) {
    addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: cols[g % 2], y: 200 + Math.floor(g / 2) * 220 }, 0);
  }
  for (let i = 1; i <= students; i++) addStudent(plan, `L${i}`);
  return plan;
}

export function sid(plan: Plan, name: string): string {
  const s = plan.students.find((x) => x.name === name);
  if (!s) throw new Error(`geen leerling ${name}`);
  return s.id;
}

export function rule(
  plan: Plan,
  type: RuleType,
  a: string,
  b?: string,
  priority: 'hard' | 'soft' = 'hard',
  extra: { seatId?: string; strength?: 1 | 2 | 3 } = {},
) {
  return addRule(plan, {
    type,
    studentA: sid(plan, a),
    studentB: b ? sid(plan, b) : undefined,
    seatId: extra.seatId,
    priority,
    strength: extra.strength ?? 2,
    enabled: true,
  });
}

export const FAST: SolveOptions = { seed: 42, timeLimitMs: 3000, optimizeMs: 80, diagnoseMs: 2000 };

export function run(plan: Plan, opts: Partial<SolveOptions> = {}, history?: Record<string, string>[]) {
  const graph = buildSeatGraph(plan.room);
  const built = buildProblem(plan, graph, { history });
  const result = solve(built.problem, { ...FAST, ...opts });
  return { graph, built, result };
}
