import { describe, expect, it } from 'vitest';
import { createDemoPlan } from '../src/data/demo';
import { toAssignments } from '../src/services/generator/buildProblem';
import { evaluateRules, summarize } from '../src/services/rules/evaluate';
import { addDesk, addGroupFromTemplate, GROUP_TEMPLATES } from '../src/services/room/roomOps';
import { createEmptyPlan } from '../src/services/plan/planFactory';
import { addStudent, assignStudent } from '../src/services/plan/planOps';
import { precheck } from '../src/solver/precheck';
import type { Plan } from '../src/models/types';
import { makePlan, rule, run, sid } from './helpers';

function applyResult(plan: Plan, r: ReturnType<typeof run>) {
  if (r.result.status !== 'solved') throw new Error(`niet opgelost: ${r.result.status}`);
  plan.arrangement.assignments = toAssignments(r.built.problem, r.result.seatOf, r.built.reserved);
  return summarize(evaluateRules(plan, r.graph));
}

describe('geldige indelingen genereren', () => {
  it('plaatst alle leerlingen op unieke zitplaatsen', () => {
    const plan = makePlan(24);
    const r = run(plan);
    expect(r.result.status).toBe('solved');
    const assignments = toAssignments(r.built.problem, (r.result as { seatOf: number[] }).seatOf, []);
    expect(Object.keys(assignments)).toHaveLength(24);
    expect(new Set(Object.values(assignments)).size).toBe(24);
  });

  it('de demoklas is oplosbaar en voldoet aan alle harde regels', () => {
    const plan = createDemoPlan(false);
    const summary = applyResult(plan, run(plan));
    expect(summary.hardTotal).toBeGreaterThan(0);
    expect(summary.hardViolated).toHaveLength(0);
  });

  it('respecteert een combinatie van harde regels (35 leerlingen)', () => {
    const plan = makePlan(35, 9);
    rule(plan, 'front', 'L1');
    rule(plan, 'front', 'L2');
    rule(plan, 'back', 'L3');
    rule(plan, 'beside', 'L4', 'L5');
    rule(plan, 'notBeside', 'L6', 'L7');
    rule(plan, 'sameGroup', 'L8', 'L9');
    rule(plan, 'sameGroup', 'L9', 'L10');
    rule(plan, 'notSameGroup', 'L11', 'L12');
    rule(plan, 'opposite', 'L13', 'L14');
    rule(plan, 'notOpposite', 'L15', 'L16');
    rule(plan, 'left', 'L17');
    rule(plan, 'right', 'L18');
    rule(plan, 'atSeat', 'L19', undefined, 'hard', { seatId: plan.room.seats[5].id });
    rule(plan, 'notAtSeat', 'L20', undefined, 'hard', { seatId: plan.room.seats[0].id });
    for (let seed = 1; seed <= 5; seed++) {
      const summary = applyResult(plan, run(plan, { seed }));
      expect(summary.hardViolated).toHaveLength(0);
      expect(summary.hardSatisfied).toBe(summary.hardTotal);
    }
  });

  it('handelt meer zitplaatsen dan leerlingen af', () => {
    const plan = makePlan(5, 6);
    const r = run(plan);
    expect(r.result.status).toBe('solved');
  });

  it('meldt te weinig zitplaatsen als aantoonbaar onmogelijk', () => {
    const plan = makePlan(26, 6);
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') expect(r.result.conflicts[0].kind).toBe('capacity');
  });

  it('werkt met een lege klas en een leeg lokaal', () => {
    const empty = createEmptyPlan('leeg');
    expect(run(empty).result.status).toBe('solved');
    addStudent(empty, 'Emma');
    const r = run(empty);
    expect(r.result.status).toBe('infeasible');
  });

  it('sluit afwezige leerlingen uit en slaat hun regels over', () => {
    const plan = makePlan(25, 6);
    plan.students[24].absent = true;
    rule(plan, 'front', 'L25');
    const r = run(plan);
    expect(r.result.status).toBe('solved');
    expect(r.built.skipped).toHaveLength(1);
    expect(r.built.skipped[0].reason).toBe('absent');
  });
});

describe('vastgezette leerlingen', () => {
  it('blijven op hun plek bij een nieuwe generatie', () => {
    const plan = makePlan(20);
    const seat = plan.room.seats[7].id;
    assignStudent(plan, sid(plan, 'L3'), seat);
    plan.arrangement.locked.push(sid(plan, 'L3'));
    for (let seed = 1; seed <= 4; seed++) {
      const r = run(plan, { seed });
      expect(r.result.status).toBe('solved');
      if (r.result.status === 'solved') {
        const a = toAssignments(r.built.problem, r.result.seatOf, r.built.reserved);
        expect(a[seat]).toBe(sid(plan, 'L3'));
      }
    }
  });

  it('een afwezige vastgezette leerling houdt zijn gereserveerde plek', () => {
    const plan = makePlan(10);
    const seat = plan.room.seats[0].id;
    assignStudent(plan, sid(plan, 'L1'), seat);
    plan.arrangement.locked.push(sid(plan, 'L1'));
    plan.students[0].absent = true;
    const r = run(plan);
    if (r.result.status !== 'solved') throw new Error();
    const a = toAssignments(r.built.problem, r.result.seatOf, r.built.reserved);
    expect(a[seat]).toBe(sid(plan, 'L1'));
    expect(Object.values(a).filter((x) => x === sid(plan, 'L1'))).toHaveLength(1);
  });

  it('wordt genegeerd als "vastgezette leerlingen behouden" uit staat', () => {
    const plan = makePlan(4, 1);
    assignStudent(plan, sid(plan, 'L1'), plan.room.seats[0].id);
    plan.arrangement.locked.push(sid(plan, 'L1'));
    rule(plan, 'notAtSeat', 'L1', undefined, 'hard', { seatId: plan.room.seats[0].id });
    plan.settings.keepLocked = true;
    expect(run(plan).result.status).toBe('infeasible');
    plan.settings.keepLocked = false;
    expect(run(plan).result.status).toBe('solved');
  });
});

describe('conflictdetectie', () => {
  it('herkent "moet naast" + "mag niet naast" als tegenstrijdig', () => {
    const plan = makePlan(8, 2);
    const r1 = rule(plan, 'beside', 'L1', 'L2');
    const r2 = rule(plan, 'notBeside', 'L2', 'L1');
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') {
      const c = r.result.conflicts.find((x) => x.kind === 'contradiction')!;
      expect(c.keys.sort()).toEqual([r1.id, r2.id].sort());
    }
  });

  it('herkent "vooraan" + "achteraan" voor dezelfde leerling', () => {
    const plan = makePlan(8, 6);
    const r1 = rule(plan, 'front', 'L1');
    const r2 = rule(plan, 'back', 'L1');
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') {
      expect(r.result.conflicts[0].kind).toBe('emptyDomain');
      expect(r.result.conflicts[0].keys.sort()).toEqual([r1.id, r2.id].sort());
    }
  });

  it('herkent een zitplaats die al vergrendeld is voor een andere leerling', () => {
    const plan = makePlan(8, 2);
    const seat = plan.room.seats[3].id;
    assignStudent(plan, sid(plan, 'L2'), seat);
    plan.arrangement.locked.push(sid(plan, 'L2'));
    const r1 = rule(plan, 'atSeat', 'L1', undefined, 'hard', { seatId: seat });
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') {
      const c = r.result.conflicts.find((x) => x.kind === 'seatTaken')!;
      expect(c.keys).toContain(r1.id);
      expect(c.keys).toContain(`lock:${sid(plan, 'L2')}`);
    }
  });

  it('herkent te veel leerlingen voor één zone (stelling van Hall)', () => {
    const plan = makePlan(12, 6); // 8 plaatsen vooraan
    for (let i = 1; i <= 9; i++) rule(plan, 'front', `L${i}`);
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') expect(r.result.conflicts[0].kind).toBe('hall');
  });

  it('herkent een keten van groepsregels die botst', () => {
    const plan = makePlan(8, 2);
    rule(plan, 'sameGroup', 'L1', 'L2');
    rule(plan, 'sameGroup', 'L2', 'L3');
    rule(plan, 'notSameGroup', 'L1', 'L3');
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') expect(r.result.conflicts.some((c) => c.kind === 'groupChain')).toBe(true);
  });

  it('vindt via de solver een minimale conflictset bij regels die alleen afzonderlijk oplosbaar zijn', () => {
    // Drie leerlingen moeten onderling allemaal naast elkaar zitten (een driehoek). In rijtjes van 3
    // kan dat niet, maar iedere regel afzonderlijk wel. Geen enkele voorcontrole vangt dit af.
    const plan = createEmptyPlan('t');
    addGroupFromTemplate(plan.room, GROUP_TEMPLATES[3], { x: 300, y: 200 }, 0);
    addGroupFromTemplate(plan.room, GROUP_TEMPLATES[3], { x: 300, y: 500 }, 0);
    for (let i = 1; i <= 6; i++) addStudent(plan, `L${i}`);
    const r1 = rule(plan, 'beside', 'L1', 'L2');
    const r2 = rule(plan, 'beside', 'L2', 'L3');
    const r3 = rule(plan, 'beside', 'L3', 'L1');
    rule(plan, 'front', 'L5', undefined, 'soft');
    const r = run(plan);
    expect(r.result.status).toBe('infeasible');
    if (r.result.status === 'infeasible') {
      const c = r.result.conflicts[0];
      expect(c.kind).toBe('conflictSet');
      expect(c.minimal).toBe(true);
      expect(c.keys.sort()).toEqual([r1.id, r2.id, r3.id].sort());
    }
  });

  it('meldt geen conflicten bij een oplosbare set regels', () => {
    const plan = createDemoPlan(false);
    const r = run(plan);
    expect(precheck(r.built.problem)).toEqual([]);
  });

  it('beweert bij een tijdslimiet niet dat de regels onmogelijk zijn', () => {
    const plan = makePlan(35, 9);
    for (let i = 1; i < 35; i++) rule(plan, 'notBeside', `L${i}`, `L${i + 1}`);
    const r = run(plan, { timeLimitMs: 0 });
    expect(['timeout', 'solved']).toContain(r.result.status);
    expect(r.result.status).not.toBe('infeasible');
  });
});

describe('voorkeuren en alternatieven', () => {
  it('realiseert haalbare voorkeuren', () => {
    const plan = makePlan(12, 6);
    rule(plan, 'front', 'L1', undefined, 'soft', { strength: 3 });
    rule(plan, 'beside', 'L2', 'L3', 'soft', { strength: 3 });
    rule(plan, 'back', 'L4', undefined, 'soft', { strength: 2 });
    const summary = applyResult(plan, run(plan, { optimizeMs: 200 }));
    expect(summary.softTotal).toBe(3);
    expect(summary.softSatisfied).toBe(3);
  });

  it('nieuwe indeling verschilt van de vorige en schendt geen harde regels', () => {
    const plan = createDemoPlan(false);
    const first = run(plan, { seed: 1 });
    if (first.result.status !== 'solved') throw new Error();
    const a1 = toAssignments(first.built.problem, first.result.seatOf, []);
    const second = run(plan, { seed: 2, optimizeMs: 200 }, [a1]);
    if (second.result.status !== 'solved') throw new Error();
    const a2 = toAssignments(second.built.problem, second.result.seatOf, []);
    const same = Object.keys(a1).filter((seat) => a1[seat] === a2[seat]).length;
    expect(same).toBeLessThan(Object.keys(a1).length / 2);
    expect(second.result.identicalToPrevious).toBe(false);
    plan.arrangement.assignments = a2;
    expect(summarize(evaluateRules(plan, second.graph)).hardViolated).toHaveLength(0);
  });

  it('evalueert overtreden regels in een handmatige indeling', () => {
    const plan = createEmptyPlan('t');
    addDesk(plan.room, 100, 100, 0);
    addDesk(plan.room, 170, 100, 0);
    const a = addStudent(plan, 'Noah');
    const b = addStudent(plan, 'Finn');
    // Zonder groep zijn de tafels geen buren.
    plan.room.groups.push({ id: 'g1', name: 'Groep 1', color: 0, relations: [] });
    plan.room.desks.forEach((d) => (d.groupId = 'g1'));
    plan.room.groups[0].relations = [{ a: plan.room.desks[0].id, b: plan.room.desks[1].id, kind: 'beside' }];
    rule(plan, 'notBeside', 'Noah', 'Finn');
    assignStudent(plan, a.id, plan.room.seats[0].id);
    assignStudent(plan, b.id, plan.room.seats[1].id);
    const { graph } = run(plan);
    const s = summarize(evaluateRules(plan, graph));
    expect(s.hardViolated).toHaveLength(1);
  });
});
