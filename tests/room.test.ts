import { describe, expect, it } from 'vitest';
import { createEmptyPlan } from '../src/services/plan/planFactory';
import { removeDesksFromPlan, addStudent, assignStudent } from '../src/services/plan/planOps';
import { classifyDeskPair, computeRelations } from '../src/services/room/relations';
import {
  addDesk,
  addGroupFromTemplate,
  duplicateItems,
  groupDesks,
  GROUP_TEMPLATES,
  moveItems,
  removeDesks,
  rotateItems,
  ungroupDesks,
} from '../src/services/room/roomOps';
import { buildSeatGraph } from '../src/services/room/seatGraph';
import { computeZones, resolveFront } from '../src/services/room/zones';
import type { Desk } from '../src/models/types';

const desk = (x: number, y: number, rotation = 0, id = `d${x}_${y}_${rotation}`): Desk => ({
  id, x, y, rotation, width: 70, height: 50, groupId: 'g',
});

describe('tafels toevoegen en verwijderen', () => {
  it('maakt per tafel precies één zitplaats met oplopend nummer', () => {
    const plan = createEmptyPlan('t');
    const d1 = addDesk(plan.room, 100, 100, 0);
    const d2 = addDesk(plan.room, 200, 100, 0);
    expect(plan.room.desks).toHaveLength(2);
    expect(plan.room.seats.map((s) => s.deskId)).toEqual([d1.id, d2.id]);
    expect(plan.room.seats.map((s) => s.number)).toEqual([1, 2]);
  });

  it('verwijdert de zitplaats en de toewijzing bij het verwijderen van een tafel', () => {
    const plan = createEmptyPlan('t');
    const d = addDesk(plan.room, 100, 100, 0);
    const s = addStudent(plan, 'Emma');
    const seat = plan.room.seats[0];
    assignStudent(plan, s.id, seat.id);
    plan.arrangement.locked.push(s.id);
    removeDesksFromPlan(plan, [d.id]);
    expect(plan.room.seats).toHaveLength(0);
    expect(plan.arrangement.assignments).toEqual({});
    expect(plan.arrangement.locked).toEqual([]);
  });
});

describe('groepjes', () => {
  it('plaatst een groepje van 4 als 2×2 met naast- en tegenoverrelaties', () => {
    const plan = createEmptyPlan('t');
    const g = addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: 300, y: 300 }, 0);
    expect(plan.room.desks.filter((d) => d.groupId === g.id)).toHaveLength(4);
    const kinds = g.relations.map((r) => r.kind).sort();
    expect(kinds).toEqual(['beside', 'beside', 'opposite', 'opposite']);
  });

  it.each([2, 3, 5, 6])('sjabloon voor %i tafels heeft geen niet-eenduidige relaties', (n) => {
    const plan = createEmptyPlan('t');
    const g = addGroupFromTemplate(plan.room, GROUP_TEMPLATES[n], { x: 300, y: 300 }, 0);
    expect(plan.room.desks).toHaveLength(n);
    expect(g.relations.some((r) => r.kind === 'ambiguous')).toBe(false);
  });

  it('koppelt losse tafels expliciet en maakt ze weer los', () => {
    const plan = createEmptyPlan('t');
    const a = addDesk(plan.room, 100, 100, 0);
    const b = addDesk(plan.room, 170, 100, 0);
    const gid = groupDesks(plan.room, [a.id, b.id]);
    expect(gid).toBeTruthy();
    expect(plan.room.groups[0].relations).toEqual([{ a: expect.any(String), b: expect.any(String), kind: 'beside' }]);
    ungroupDesks(plan.room, [a.id]);
    // Een groep met één tafel wordt opgeheven; tafel b blijft bestaan.
    expect(plan.room.groups).toHaveLength(0);
    expect(plan.room.desks).toHaveLength(2);
    expect(plan.room.desks.every((d) => d.groupId === null)).toBe(true);
  });

  it('fysiek tegen elkaar staan is niet automatisch hetzelfde groepje', () => {
    const plan = createEmptyPlan('t');
    addDesk(plan.room, 100, 100, 0);
    addDesk(plan.room, 170, 100, 0);
    const graph = buildSeatGraph(plan.room);
    expect(graph.seats[0].groupKey).not.toBe(graph.seats[1].groupKey);
    expect(graph.beside[0]).toEqual([]);
  });

  it('een tafel uit een groep verwijderen behoudt de andere tafels', () => {
    const plan = createEmptyPlan('t');
    const g = addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: 300, y: 300 }, 0);
    removeDesks(plan.room, [plan.room.desks[0].id]);
    expect(plan.room.desks).toHaveLength(3);
    expect(plan.room.desks.every((d) => d.groupId === g.id)).toBe(true);
    expect(plan.room.groups[0].relations.length).toBeGreaterThan(0);
  });

  it('verplaatsen en draaien van een hele groep behoudt de interne posities en relaties', () => {
    const plan = createEmptyPlan('t');
    const g = addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: 300, y: 300 }, 0);
    const ids = plan.room.desks.map((d) => d.id);
    const before = JSON.stringify(g.relations);
    const dist = (i: number, j: number) =>
      Math.hypot(plan.room.desks[i].x - plan.room.desks[j].x, plan.room.desks[i].y - plan.room.desks[j].y);
    const d01 = dist(0, 1);
    moveItems(plan.room, ids, 123, -45);
    rotateItems(plan.room, ids, 37);
    expect(JSON.stringify(plan.room.groups[0].relations)).toBe(before);
    expect(dist(0, 1)).toBeCloseTo(d01, 1);
    // Opnieuw berekenen na draaien geeft dezelfde relaties (rotatie-invariant).
    const recomputed = computeRelations(plan.room.desks).map((r) => r.kind).sort();
    expect(recomputed).toEqual(['beside', 'beside', 'opposite', 'opposite']);
  });

  it('dupliceert een volledige groep als nieuwe groep', () => {
    const plan = createEmptyPlan('t');
    addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: 300, y: 300 }, 0);
    const newIds = duplicateItems(plan.room, plan.room.desks.map((d) => d.id));
    expect(newIds).toHaveLength(4);
    expect(plan.room.groups).toHaveLength(2);
    expect(plan.room.groups[1].relations).toHaveLength(4);
    expect(new Set(plan.room.seats.map((s) => s.number)).size).toBe(8);
  });
});

describe('naast- en tegenoverrelaties', () => {
  it('herkent naast elkaar, ook gedraaid', () => {
    expect(classifyDeskPair(desk(0, 0), desk(70, 0))).toBe('beside');
    expect(classifyDeskPair(desk(0, 0, 90), desk(0, 70, 90))).toBe('beside');
    expect(classifyDeskPair(desk(0, 0, 45), desk(70 * Math.SQRT1_2, 70 * Math.SQRT1_2, 45))).toBe('beside');
  });

  it('herkent tegenover elkaar', () => {
    expect(classifyDeskPair(desk(0, 50), desk(0, 0, 180))).toBe('opposite');
    expect(classifyDeskPair(desk(0, 0, 180), desk(0, 50))).toBe('opposite');
    expect(classifyDeskPair(desk(0, 0, 90), desk(50, 0, 270))).toBe('opposite');
  });

  it('geeft geen relatie bij afstand, diagonaal of achter elkaar', () => {
    expect(classifyDeskPair(desk(0, 0), desk(300, 0))).toBeNull();
    expect(classifyDeskPair(desk(0, 0), desk(70, 50))).toBeNull();
    expect(classifyDeskPair(desk(0, 0), desk(0, 50))).toBeNull();
  });

  it('markeert onduidelijke standen als niet eenduidig', () => {
    expect(classifyDeskPair(desk(0, 0), desk(60, 0, 90))).toBe('ambiguous');
    expect(classifyDeskPair(desk(0, 0), desk(35, 0))).toBe('ambiguous'); // half overlappend
  });

  it('kleine afwijkingen van enkele pixels veranderen de relatie niet', () => {
    expect(classifyDeskPair(desk(0, 0), desk(73, 3, 2))).toBe('beside');
    expect(classifyDeskPair(desk(0, 52), desk(2, 0, 178))).toBe('opposite');
  });
});

describe('zitplaatsen en zones', () => {
  it('inventariseert alle zitplaatsen met groep en relaties', () => {
    const plan = createEmptyPlan('t');
    addGroupFromTemplate(plan.room, GROUP_TEMPLATES[4], { x: 300, y: 200 }, 0);
    addDesk(plan.room, 700, 600, 0);
    const graph = buildSeatGraph(plan.room);
    expect(graph.seats).toHaveLength(5);
    expect(graph.beside.reduce((n, l) => n + l.length, 0)).toBe(4); // 2 paren × 2 richtingen
    expect(graph.opposite.reduce((n, l) => n + l.length, 0)).toBe(4);
  });

  it('bepaalt de voorkant automatisch aan de hand van het digibord', () => {
    const plan = createEmptyPlan('t');
    expect(resolveFront(plan.room)).toBe('top');
    plan.room.objects[0].x = 10;
    plan.room.objects[0].y = 400;
    expect(resolveFront(plan.room)).toBe('left');
    plan.room.front = 'bottom';
    expect(resolveFront(plan.room)).toBe('bottom');
  });

  it('verdeelt zones in drie stroken ten opzichte van de voorkant', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ];
    const top = computeZones(pts, 'top').flags;
    expect(top.map((f) => f.front)).toEqual([true, false, false]);
    expect(top.map((f) => f.back)).toEqual([false, false, true]);
    expect(top.map((f) => f.left)).toEqual([true, false, false]);
    expect(top.map((f) => f.middle)).toEqual([false, true, false]);
    const bottom = computeZones(pts, 'bottom').flags;
    expect(bottom.map((f) => f.front)).toEqual([false, false, true]);
    // Voorkant onder: leerlingen kijken naar beneden, hun linkerhand wijst naar +x.
    expect(bottom.map((f) => f.left)).toEqual([false, false, true]);
    const left = computeZones(pts, 'left').flags;
    expect(left.map((f) => f.front)).toEqual([true, false, false]);
    expect(left.map((f) => f.left)).toEqual([false, false, true]);
  });

  it('negeert niet-beschikbare zitplaatsen bij het bepalen van de zones', () => {
    const plan = createEmptyPlan('t');
    addDesk(plan.room, 100, 100, 0);
    addDesk(plan.room, 100, 300, 0);
    addDesk(plan.room, 100, 700, 0);
    plan.room.seats[2].disabled = true;
    const g = buildSeatGraph(plan.room);
    expect(g.seats[1].zones.back).toBe(true);
    expect(g.seats[2].zones.back).toBe(false);
  });
});
