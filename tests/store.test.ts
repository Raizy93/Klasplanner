import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoPlan } from '../src/data/demo';
import type { Plan } from '../src/models/types';
import { addStudent, assignStudent, setStudentAbsent } from '../src/services/plan/planOps';
import { addDesk } from '../src/services/room/roomOps';
import { activePlan, useAppStore } from '../src/store/appStore';
import { evaluateRules, summarize } from '../src/services/rules/evaluate';
import { getSeatGraph } from '../src/store/selectors';

const S = () => useAppStore.getState();
const plan = () => activePlan(S());

beforeEach(() => {
  S().hydrate([createDemoPlan(true)], null);
});

describe('applicatiestatus', () => {
  it('ongedaan maken en opnieuw uitvoeren', () => {
    const n = plan().students.length;
    S().update((d) => void addStudent(d as Plan, 'Nieuw'));
    expect(plan().students).toHaveLength(n + 1);
    S().undo();
    expect(plan().students).toHaveLength(n);
    S().redo();
    expect(plan().students).toHaveLength(n + 1);
  });

  it('voegt snelle opeenvolgende wijzigingen met dezelfde sleutel samen in de geschiedenis', () => {
    const desk = plan().room.desks[0];
    for (let i = 1; i <= 5; i++) S().update((d) => void (d.room.desks[0].x = desk.x + i), { coalesceKey: 'x' });
    expect(S().past).toHaveLength(1);
    S().undo();
    expect(plan().room.desks[0].x).toBe(desk.x);
  });

  it('afwezig markeren laat de bestaande indeling intact', () => {
    const before = { ...plan().arrangement.assignments };
    const id = plan().students[0].id;
    S().update((d) => setStudentAbsent(d as Plan, id, true));
    expect(plan().arrangement.assignments).toEqual(before);
  });

  it('voorkomt dubbele toewijzing van dezelfde leerling', () => {
    const [s1, s2] = plan().room.seats;
    const student = plan().arrangement.assignments[s1.id];
    S().update((d) => {
      // Bewust een corrupte toestand proberen te maken.
      d.arrangement.assignments[s2.id] = student;
    });
    const seats = Object.entries(plan().arrangement.assignments).filter(([, v]) => v === student);
    expect(seats).toHaveLength(1);
  });

  it('plattegronden aanmaken, dupliceren, hernoemen, wisselen en verwijderen', () => {
    const first = plan().id;
    S().createPlan('empty', 'Groep 8 – Oktober');
    const second = plan().id;
    expect(plan().name).toBe('Groep 8 – Oktober');
    expect(plan().students).toHaveLength(0);
    S().duplicatePlanById(first);
    expect(S().planOrder).toHaveLength(3);
    S().renamePlan(second, 'Groep 8 – November');
    expect(S().plans[second].name).toBe('Groep 8 – November');
    S().openPlan(first);
    expect(plan().id).toBe(first);
    expect(S().past).toHaveLength(0); // geschiedenis is per plattegrond
    S().deletePlan(first);
    expect(S().plans[first]).toBeUndefined();
    expect(S().activePlanId).not.toBe(first);
  });

  it('het laatste plan verwijderen laat een lege klas achter', () => {
    S().deletePlan(plan().id);
    expect(S().planOrder).toHaveLength(1);
    expect(plan().name).toBe('Nieuwe klas');
  });

  it('genereert een geldige indeling via de store (zonder worker)', async () => {
    await S().generate();
    const report = S().lastReport!;
    expect(report.status).toBe('solved');
    expect(report.summary!.hardViolated).toHaveLength(0);
    const sum = summarize(evaluateRules(plan(), getSeatGraph(plan().room)));
    expect(sum.hardSatisfied).toBe(sum.hardTotal);
    expect(S().generated).toHaveLength(1);
    await S().generate();
    expect(S().generated).toHaveLength(2);
    // Vorige indeling terughalen.
    S().showGenerated(0);
    expect(plan().arrangement.assignments).toEqual(S().generated[0].assignments);
  }, 20000);

  it('geeft bij tegenstrijdige regels een melding en laat de indeling ongemoeid', async () => {
    const before = { ...plan().arrangement.assignments };
    const emma = plan().students.find((s) => s.name === 'Emma')!.id;
    S().update((d) => {
      d.rules.push({ id: 'r-x', type: 'back', studentA: emma, priority: 'hard', strength: 2, enabled: true, createdAt: 0 });
    });
    await S().generate();
    expect(S().lastReport!.status).toBe('infeasible');
    expect(S().lastReport!.conflicts![0].keys).toContain('r-x');
    expect(plan().arrangement.assignments).toEqual(before);
  }, 20000);

  it('verwijderde tafel met toegewezen leerling: leerling wordt niet geplaatst', () => {
    let deskId = '';
    S().update((d) => {
      deskId = addDesk(d.room as Plan['room'], 50, 50, 0).id;
    });
    const seat = plan().room.seats.find((s) => s.deskId === deskId)!;
    const sid = plan().students[0].id;
    S().update((d) => void assignStudent(d as Plan, sid, seat.id));
    S().update((d) => {
      d.room.desks = d.room.desks.filter((x) => x.id !== deskId);
      d.room.seats = d.room.seats.filter((x) => x.deskId !== deskId);
    });
    expect(Object.values(plan().arrangement.assignments)).not.toContain(sid);
  });
});
