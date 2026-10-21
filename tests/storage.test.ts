import { describe, expect, it } from 'vitest';
import { createDemoPlan } from '../src/data/demo';
import { SCHEMA_VERSION } from '../src/models/types';
import { addStudent, parseNameList, removeStudent, assignStudent } from '../src/services/plan/planOps';
import { createEmptyPlan } from '../src/services/plan/planFactory';
import {
  loadData,
  parseImport,
  saveData,
  serializePlans,
  STORAGE_KEY,
  type StorageLike,
} from '../src/services/storage/storage';
import { sanitizeArrangement, validatePlan } from '../src/validation/planValidation';
import { rule } from './helpers';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('leerlingen', () => {
  it('voegt toe en verwijdert, inclusief regels en zitplaats', () => {
    const plan = createDemoPlan(true);
    const emma = plan.students.find((s) => s.name === 'Emma')!;
    const rulesBefore = plan.rules.length;
    expect(Object.values(plan.arrangement.assignments)).toContain(emma.id);
    removeStudent(plan, emma.id);
    expect(plan.students.some((s) => s.id === emma.id)).toBe(false);
    expect(plan.rules.length).toBe(rulesBefore - 1);
    expect(Object.values(plan.arrangement.assignments)).not.toContain(emma.id);
  });

  it('staat dubbele namen toe met unieke ID\'s', () => {
    const plan = createEmptyPlan('t');
    const a = addStudent(plan, 'Sam');
    const b = addStudent(plan, 'Sam');
    expect(a.id).not.toBe(b.id);
  });

  it('leest een geplakte namenlijst en meldt lege regels en dubbele namen', () => {
    const r = parseNameList('Emma\n\n  Lars  \r\nEmma\nNoah\n', ['Noah']);
    expect(r.names).toEqual(['Emma', 'Lars', 'Emma', 'Noah']);
    expect(r.emptyLines).toBe(2);
    expect(r.duplicates).toEqual(['Emma', 'Noah']);
  });
});

describe('opslaan en opnieuw laden', () => {
  it('slaat op en laadt identieke gegevens terug', () => {
    const storage = memoryStorage();
    const plan = createDemoPlan(true);
    const data = { schemaVersion: SCHEMA_VERSION, activePlanId: plan.id, plans: [plan] };
    expect(saveData(storage, data).ok).toBe(true);
    const loaded = loadData(storage);
    expect(loaded.error).toBeUndefined();
    expect(loaded.data!.plans[0]).toEqual(plan);
    expect(loaded.data!.activePlanId).toBe(plan.id);
  });

  it('bewaart beschadigde gegevens apart en crasht niet', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{kapot');
    const loaded = loadData(storage);
    expect(loaded.data).toBeNull();
    expect(loaded.error).toMatch(/beschadigd/);
    expect([...storage.map.keys()].some((k) => k.includes('beschadigd'))).toBe(true);
  });

  it('meldt wanneer opslag niet beschikbaar is', () => {
    expect(loadData(null).error).toBeTruthy();
    expect(saveData(null, { schemaVersion: 1, activePlanId: null, plans: [] }).ok).toBe(false);
  });
});

describe('JSON-import en -export', () => {
  it('exporteert en importeert zonder gegevensverlies (met nieuw ID)', () => {
    const plan = createDemoPlan(true);
    const text = serializePlans([plan]);
    const r = parseImport(text, [plan.name]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plans[0].id).not.toBe(plan.id);
      expect(r.plans[0].name).toBe(`${plan.name} (geïmporteerd)`);
      expect(r.plans[0].students).toEqual(plan.students);
      expect(r.plans[0].rules).toEqual(plan.rules);
      expect(r.plans[0].room).toEqual(plan.room);
      expect(r.plans[0].arrangement).toEqual(plan.arrangement);
    }
  });

  it('neemt het volledige sociogram en sociogramregels mee in export en import', () => {
    const plan = createDemoPlan(false);
    plan.sociogram.goals = { work: 'reinforce', play: 'build' };
    rule(plan, 'notSameGroup', 'Noah', 'Finn', 'soft');
    plan.rules[plan.rules.length - 1].source = 'sociogram';
    plan.rules[plan.rules.length - 1].note = 'Sociogram samenwerken: wederzijds negatief';
    const r = parseImport(serializePlans([plan]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.plans[0].sociogram.responses)).toHaveLength(22);
      expect(r.plans[0].sociogram).toEqual(plan.sociogram);
      expect(r.plans[0].rules).toEqual(plan.rules);
    }
  });

  it('weigert ongeldige of vreemde bestanden', () => {
    expect(parseImport('geen json').ok).toBe(false);
    expect(parseImport('{"foo":1}').ok).toBe(false);
    expect(parseImport(JSON.stringify({ app: 'klassenplanner', schemaVersion: 99, plans: [] })).ok).toBe(false);
    expect(parseImport(JSON.stringify({ app: 'klassenplanner', schemaVersion: 1, plans: [{ id: 'x' }] })).ok).toBe(false);
  });

  it('weigert een plattegrond met een onbekend regeltype', () => {
    const plan = createEmptyPlan('t');
    addStudent(plan, 'A');
    const raw = JSON.parse(JSON.stringify(plan));
    raw.rules = [{ id: 'r', type: 'vliegen', studentA: plan.students[0].id }];
    expect(validatePlan(raw).ok).toBe(false);
  });

  it('herstelt dubbele toewijzingen en verwijzingen naar verwijderde objecten', () => {
    const plan = createEmptyPlan('t');
    const s = addStudent(plan, 'A');
    const seats = ['s1', 's2'];
    plan.room.desks.push({ id: 'd1', x: 0, y: 0, rotation: 0, width: 70, height: 50, groupId: null });
    plan.room.desks.push({ id: 'd2', x: 100, y: 0, rotation: 0, width: 70, height: 50, groupId: 'bestaat-niet' });
    plan.room.seats.push({ id: seats[0], deskId: 'd1', number: 1, disabled: false });
    plan.room.seats.push({ id: seats[1], deskId: 'd2', number: 2, disabled: false });
    const clean = sanitizeArrangement(
      { assignments: { s1: s.id, s2: s.id, s9: s.id, s1x: 'onbekend' }, locked: [s.id, 'onbekend'] },
      plan,
    );
    expect(Object.keys(clean.assignments)).toEqual(['s1']);
    expect(clean.locked).toEqual([s.id]);
    const v = validatePlan(JSON.parse(JSON.stringify(plan)));
    expect(v.ok && v.value.room.desks[1].groupId).toBe(null);
  });

  it('behoudt regels van leerlingen; regels naar verwijderde zitplaatsen blijven zichtbaar', () => {
    const plan = createDemoPlan(false);
    const r = rule(plan, 'atSeat', 'Emma', undefined, 'hard', { seatId: 'verwijderd' });
    const v = validatePlan(JSON.parse(JSON.stringify(plan)));
    expect(v.ok && v.value.rules.some((x) => x.id === r.id)).toBe(true);
  });

  it('assignStudent wisselt twee leerlingen van plek', () => {
    const plan = createDemoPlan(true);
    const [s1, s2] = plan.room.seats;
    const a = plan.arrangement.assignments[s1.id];
    const b = plan.arrangement.assignments[s2.id];
    assignStudent(plan, a, s2.id);
    expect(plan.arrangement.assignments[s2.id]).toBe(a);
    expect(plan.arrangement.assignments[s1.id]).toBe(b);
  });
});
