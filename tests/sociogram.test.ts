import { describe, expect, it } from 'vitest';
import { createDemoPlan } from '../src/data/demo';
import type { Plan } from '../src/models/types';
import { addStudent, removeStudent } from '../src/services/plan/planOps';
import { createEmptyPlan } from '../src/services/plan/planFactory';
import { analyzeSociogram, classify } from '../src/services/sociogram/analysis';
import { choiceOf, nextChoice, setChoice, setFilledIn } from '../src/services/sociogram/sociogramOps';
import { buildSuggestions, kindsForGoal } from '../src/services/sociogram/suggestions';
import { validatePlan } from '../src/validation/planValidation';
import { sid } from './helpers';

const demo = () => createDemoPlan(false);
const pairNames = (plan: Plan, a: string, b: string) => {
  const name = (id: string) => plan.students.find((s) => s.id === id)!.name;
  return [name(a), name(b)].sort().join('+');
};

describe('sociogram invoeren', () => {
  it('positief en negatief sluiten elkaar uit binnen één vraag', () => {
    const plan = createEmptyPlan('t');
    const a = addStudent(plan, 'A').id;
    const b = addStudent(plan, 'B').id;
    setChoice(plan, a, b, 'work', 'pos');
    expect(choiceOf(plan.sociogram.responses[a], 'work', b)).toBe('pos');
    setChoice(plan, a, b, 'work', 'neg');
    expect(plan.sociogram.responses[a].workPos).toEqual([]);
    expect(plan.sociogram.responses[a].workNeg).toEqual([b]);
    // Spelen staat los van samenwerken.
    expect(choiceOf(plan.sociogram.responses[a], 'play', b)).toBe('none');
    setChoice(plan, a, a, 'work', 'pos');
    expect(plan.sociogram.responses[a].workPos).toEqual([]);
  });

  it('klikken doorloopt leeg → graag → liever niet → leeg', () => {
    expect(nextChoice('none')).toBe('pos');
    expect(nextChoice('pos')).toBe('neg');
    expect(nextChoice('neg')).toBe('none');
  });

  it('formulier zonder keuzes kan als ingevuld worden gemarkeerd', () => {
    const plan = createEmptyPlan('t');
    const a = addStudent(plan, 'A').id;
    setFilledIn(plan, a, true);
    expect(plan.sociogram.responses[a]).toEqual({ workPos: [], workNeg: [], playPos: [], playNeg: [] });
    setFilledIn(plan, a, false);
    expect(plan.sociogram.responses[a]).toBeUndefined();
  });

  it('een verwijderde leerling verdwijnt uit alle antwoorden', () => {
    const plan = demo();
    const jayden = sid(plan, 'Jayden');
    removeStudent(plan, jayden);
    expect(plan.sociogram.responses[jayden]).toBeUndefined();
    for (const r of Object.values(plan.sociogram.responses)) {
      expect([...r.workPos, ...r.workNeg, ...r.playPos, ...r.playNeg]).not.toContain(jayden);
    }
  });

  it('validatie ruimt ongeldige sociogramgegevens op', () => {
    const plan = createEmptyPlan('t');
    const a = addStudent(plan, 'A').id;
    const b = addStudent(plan, 'B').id;
    const raw = JSON.parse(JSON.stringify(plan));
    raw.sociogram = {
      responses: { [a]: { workPos: [b, b, a, 'weg'], workNeg: [b], playPos: 'kapot' }, onbekend: { workPos: [a] } },
      date: 'gisteren',
      goals: { work: 'build', play: 'iets' },
    };
    const v = validatePlan(raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.sociogram.responses).toEqual({ [a]: { workPos: [b], workNeg: [], playPos: [], playNeg: [] } });
    expect(v.value.sociogram.date).toBeUndefined();
    expect(v.value.sociogram.goals).toEqual({ work: 'build', play: 'none' });
  });

  it('oude bestanden zonder sociogram blijven geldig', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyPlan('t')));
    delete raw.sociogram;
    const v = validatePlan(raw);
    expect(v.ok && v.value.sociogram).toEqual({ responses: {}, goals: { work: 'none', play: 'none' } });
  });
});

describe('sociogram analyseren', () => {
  it('telt respondenten en ontvangen keuzes', () => {
    const plan = demo();
    const an = analyzeSociogram(plan, 'work');
    expect(an.total).toBe(24);
    expect(an.respondents).toBe(22); // Bram en Fleur vulden niet in
    expect(an.stats.get(sid(plan, 'Bram'))!.filledIn).toBe(false);
    expect(an.stats.get(sid(plan, 'Lars'))!.posIn).toBe(11);
    expect(an.stats.get(sid(plan, 'Jayden'))!.negIn).toBe(10);
  });

  it('vindt wederzijds positieve, wederzijds negatieve en tegengestelde keuzes', () => {
    const plan = demo();
    const an = analyzeSociogram(plan, 'work');
    const mp = an.mutualPos.map((p) => pairNames(plan, p.a, p.b));
    expect(mp).toContain('Julia+Sophie');
    expect(mp).toContain('Emma+Lisa');
    expect(an.mutualNeg.map((p) => pairNames(plan, p.a, p.b)).sort()).toEqual(['Daan+Finn', 'Finn+Noah']);
    const conflicts = an.conflicting.map((p) => `${plan.students.find((s) => s.id === p.from)!.name}>${plan.students.find((s) => s.id === p.to)!.name}`);
    expect(conflicts).toContain('Tess>Roan');
    expect(conflicts).not.toContain('Jayden>Daan'); // Daan kiest Jayden niet negatief terug
  });

  it('herkent opvallende posities (populair, afgewezen, controversieel)', () => {
    const plan = demo();
    const an = analyzeSociogram(plan, 'work');
    expect(an.statusAvailable).toBe(true);
    expect(an.stats.get(sid(plan, 'Lars'))!.status).toBe('popular');
    expect(an.stats.get(sid(plan, 'Jayden'))!.status).toBe('rejected');
    expect(an.stats.get(sid(plan, 'Daan'))!.status).toBe('controversial');
    expect(an.noPositive).toContain(sid(plan, 'Milan'));
  });

  it('vindt hechte groepjes waarin iedereen elkaar wederzijds kiest', () => {
    const plan = demo();
    const an = analyzeSociogram(plan, 'work');
    const names = an.clusters.map((c) => c.map((id) => plan.students.find((s) => s.id === id)!.name).sort().join(','));
    expect(names.sort()).toEqual(['Daan,Lars,Sem', 'Emma,Lisa,Sophie', 'Nora,Saar,Zoë']);
  });

  it('berekent geen status bij te weinig ingevulde formulieren', () => {
    const plan = createEmptyPlan('t');
    const ids = ['A', 'B', 'C', 'D'].map((n) => addStudent(plan, n).id);
    setChoice(plan, ids[0], ids[1], 'work', 'pos');
    const an = analyzeSociogram(plan, 'work');
    expect(an.statusAvailable).toBe(false);
    expect([...an.stats.values()].every((s) => s.status === null)).toBe(true);
    expect(an.noPositive).toEqual([]);
  });

  it('classificeert volgens de drempels van Coie & Dodge', () => {
    expect(classify(1.5, -0.8, 1.6, 0.4)).toBe('popular');
    expect(classify(-0.9, 1.7, -1.8, 0.5)).toBe('rejected');
    expect(classify(-1, -0.9, 0, -1.4)).toBe('neglected');
    expect(classify(1.2, 1.3, 0, 1.6)).toBe('controversial');
    expect(classify(0.2, 0.1, 0.1, 0.2)).toBe('average');
  });
});

describe('regelvoorstellen', () => {
  it('bekrachtigen: wederzijds positief samen, negatieve relaties uit elkaar', () => {
    const plan = demo();
    const s = buildSuggestions(plan, 'work', 'reinforce');
    const together = s.filter((x) => x.kind === 'mutualPosTogether').map((x) => pairNames(plan, x.a, x.b));
    expect(together).toContain('Julia+Sophie');
    const apart = s.filter((x) => x.kind === 'mutualNegApart').map((x) => pairNames(plan, x.a, x.b));
    expect(apart.sort()).toEqual(['Daan+Finn', 'Finn+Noah']);
    // De demo heeft al "Sophie moet in hetzelfde groepje als Julia".
    expect(s.find((x) => x.kind === 'mutualPosTogether' && pairNames(plan, x.a, x.b) === 'Julia+Sophie')!.exists).toBe(true);
  });

  it('nieuwe relaties: eenzijdig positieve keuzes samen', () => {
    const plan = demo();
    const s = buildSuggestions(plan, 'work', 'build');
    expect(s.some((x) => x.kind === 'mutualPosTogether')).toBe(false);
    expect(s.filter((x) => x.kind === 'oneSidedPosTogether').length).toBeGreaterThan(0);
    expect(kindsForGoal('build').find((k) => k.kind === 'spreadMutualPos')!.checked).toBe(false);
  });

  it('zonder doel worden alleen negatieve relaties voorgesteld', () => {
    const plan = demo();
    const s = buildSuggestions(plan, 'play', 'none');
    expect(s.every((x) => x.type === 'notSameGroup')).toBe(true);
  });

  it('signaleert een voorstel dat botst met een bestaande regel', () => {
    const plan = demo();
    const noah = sid(plan, 'Noah');
    const finn = sid(plan, 'Finn');
    plan.rules.push({ id: 'r1', type: 'sameGroup', studentA: finn, studentB: noah, priority: 'soft', strength: 2, enabled: true, createdAt: 0 });
    const s = buildSuggestions(plan, 'work', 'none').find((x) => x.kind === 'mutualNegApart' && [x.a, x.b].includes(noah))!;
    expect(s.conflictsWith?.id).toBe('r1');
  });
});
