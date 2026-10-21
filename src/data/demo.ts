import type { Plan } from '../models/types';
import { buildProblem, toAssignments } from '../services/generator/buildProblem';
import { addRule, addStudent } from '../services/plan/planOps';
import { createEmptyPlan } from '../services/plan/planFactory';
import { addGroupFromTemplate, addObject, GROUP_TEMPLATES } from '../services/room/roomOps';
import { buildSeatGraph } from '../services/room/seatGraph';
import { solve } from '../solver/solve';

export const DEMO_NAMES = [
  'Emma', 'Lars', 'Sophie', 'Daan', 'Finn', 'Julia', 'Sem', 'Noah',
  'Milan', 'Lisa', 'Tess', 'Roan', 'Lieke', 'Thijs', 'Eva', 'Joris',
  'Saar', 'Mees', 'Jayden', 'Zoë', 'Levi', 'Nora', 'Bram', 'Fleur',
];

/**
 * Demonstratieklas: 24 fictieve leerlingen, zes groepjes van vier, digibord, deur,
 * leerkrachttafel en een aantal (samen oplosbare) voorbeeldregels.
 */
export function createDemoPlan(withArrangement = true): Plan {
  const plan = createEmptyPlan('Demoklas – Groep 6');
  const room = plan.room;
  room.width = 900;
  room.height = 800;
  room.objects = [];
  addObject(room, 'whiteboard', 420, 22);
  const teacher = addObject(room, 'teacherDesk', 790, 95);
  teacher.label = 'Leerkracht';
  addObject(room, 'door', 893, 380, 90);
  addObject(room, 'window', 7, 200, 90);
  addObject(room, 'window', 7, 430, 90);
  addObject(room, 'window', 7, 660, 90);
  addObject(room, 'cabinet', 868, 640, 90);
  addObject(room, 'plant', 45, 45);
  addObject(room, 'plant', 45, 755);

  const cols = [250, 570];
  const rows = [250, 470, 690];
  for (const y of rows) for (const x of cols) addGroupFromTemplate(room, GROUP_TEMPLATES[4], { x, y }, 0);

  const ids = new Map<string, string>();
  for (const name of DEMO_NAMES) ids.set(name, addStudent(plan, name).id);
  const id = (n: string) => ids.get(n)!;

  const base = { strength: 2 as const, enabled: true };
  addRule(plan, { ...base, type: 'front', studentA: id('Emma'), priority: 'hard' });
  addRule(plan, { ...base, type: 'notBeside', studentA: id('Noah'), studentB: id('Finn'), priority: 'hard' });
  addRule(plan, { ...base, type: 'sameGroup', studentA: id('Sophie'), studentB: id('Julia'), priority: 'hard' });
  addRule(plan, { ...base, type: 'back', studentA: id('Milan'), priority: 'hard' });
  addRule(plan, { ...base, type: 'front', studentA: id('Lars'), priority: 'soft' });
  addRule(plan, { ...base, type: 'notSameGroup', studentA: id('Daan'), studentB: id('Sem'), priority: 'soft', strength: 3 });
  addRule(plan, { ...base, type: 'beside', studentA: id('Lisa'), studentB: id('Eva'), priority: 'soft', strength: 1 });
  addRule(plan, { ...base, type: 'notOpposite', studentA: id('Jayden'), studentB: id('Levi'), priority: 'soft' });

  if (withArrangement) {
    const graph = buildSeatGraph(room);
    const built = buildProblem(plan, graph);
    const result = solve(built.problem, { seed: 20241, timeLimitMs: 2000, optimizeMs: 120 });
    if (result.status === 'solved') {
      plan.arrangement.assignments = toAssignments(built.problem, result.seatOf, built.reserved);
    }
  }
  return plan;
}
