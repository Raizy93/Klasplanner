import { DESK_HEIGHT, DESK_WIDTH, OBJECT_DEFAULTS, PALETTE } from '../../models/constants';
import type { Desk, DeskGroup, ID, Room, RoomObject, RoomObjectType } from '../../models/types';
import { boundsOf, normAngle, rectCorners, rotate, rotateAround, type Point } from '../../utils/geometry';
import { createId } from '../../utils/id';
import { computeRelations } from './relations';

/**
 * Bewerkingen op het lokaal. Alle functies muteren het meegegeven `room`-object
 * (bedoeld voor gebruik binnen een immer-producer) en zijn puur qua invoer/uitvoer.
 */

export interface GroupTemplate {
  /** Aantal tafels per rij, van voor naar achter gezien vanuit de leerling: [voorste rij, achterste rij]. */
  rows: number[];
  /** Bij twee rijen: kijkt de voorste rij naar de achterste (tegenover elkaar)? */
  facing: boolean;
}

export const GROUP_TEMPLATES: Record<number, GroupTemplate> = {
  2: { rows: [2], facing: false },
  3: { rows: [3], facing: false },
  4: { rows: [2, 2], facing: true },
  5: { rows: [2, 3], facing: true },
  6: { rows: [3, 3], facing: true },
};

export function nextSeatNumber(room: Room): number {
  return room.seats.reduce((m, s) => Math.max(m, s.number), 0) + 1;
}

export function addDesk(room: Room, x: number, y: number, rotation: number, groupId: ID | null = null): Desk {
  const desk: Desk = {
    id: createId('desk'),
    x,
    y,
    rotation: normAngle(rotation),
    width: DESK_WIDTH,
    height: DESK_HEIGHT,
    groupId,
  };
  room.desks.push(desk);
  room.seats.push({ id: createId('seat'), deskId: desk.id, number: nextSeatNumber(room), disabled: false });
  return desk;
}

function nextGroupName(room: Room): string {
  const used = new Set(room.groups.map((g) => g.name));
  let n = room.groups.length + 1;
  while (used.has(`Groep ${n}`)) n++;
  return `Groep ${n}`;
}

function nextGroupColor(room: Room): number {
  const counts = PALETTE.map(() => 0);
  room.groups.forEach((g) => counts[g.color % PALETTE.length]++);
  return counts.indexOf(Math.min(...counts));
}

export function createGroup(room: Room, name?: string): DeskGroup {
  const group: DeskGroup = {
    id: createId('grp'),
    name: name ?? nextGroupName(room),
    color: nextGroupColor(room),
    relations: [],
  };
  room.groups.push(group);
  return group;
}

/**
 * Plaatst een tafelgroep volgens een sjabloon rond `center`. `baseRotation` is de rotatie
 * waarbij leerlingen naar de voorkant kijken. Retourneert de nieuwe groep.
 */
export function addGroupFromTemplate(
  room: Room,
  template: GroupTemplate,
  center: Point,
  baseRotation: number,
): DeskGroup {
  const group = createGroup(room);
  const W = DESK_WIDTH;
  const H = DESK_HEIGHT;
  const rows = template.rows.filter((n) => n > 0);
  const twoRows = rows.length === 2;
  // Afstand tussen de middelpunten van twee rijen: tegen elkaar (facing) of met ruimte voor stoelen.
  const rowGap = twoRows ? (template.facing ? H : H + 50) : 0;
  const maxPerRow = Math.max(...rows);
  rows.forEach((count, r) => {
    const y = twoRows ? (r === 0 ? -rowGap / 2 : rowGap / 2) : 0;
    // Rijen worden links uitgelijnd zodat tafels recht tegenover elkaar blijven staan.
    const startX = -((maxPerRow - 1) * W) / 2;
    for (let i = 0; i < count; i++) {
      const local = { x: startX + i * W, y };
      const facingBack = twoRows && template.facing && r === 0;
      const rot = baseRotation + (facingBack ? 180 : 0);
      const p = rotate(local, baseRotation);
      addDesk(room, center.x + p.x, center.y + p.y, rot, group.id);
    }
  });
  recomputeGroupRelations(room, group.id);
  return group;
}

export function recomputeGroupRelations(room: Room, groupId: ID): void {
  const group = room.groups.find((g) => g.id === groupId);
  if (!group) return;
  group.relations = computeRelations(room.desks.filter((d) => d.groupId === groupId));
}

/** Verwijdert lege groepen en heft groepen met één tafel op. */
export function cleanupGroups(room: Room): void {
  const counts = new Map<ID, number>();
  room.desks.forEach((d) => d.groupId && counts.set(d.groupId, (counts.get(d.groupId) ?? 0) + 1));
  for (const g of [...room.groups]) {
    const c = counts.get(g.id) ?? 0;
    if (c <= 1) {
      room.desks.forEach((d) => {
        if (d.groupId === g.id) d.groupId = null;
      });
      room.groups = room.groups.filter((x) => x.id !== g.id);
    }
  }
}

/**
 * Koppelt tafels expliciet tot één groep. Bevat de selectie al tafels van één bestaande groep,
 * dan worden de overige tafels aan die groep toegevoegd; anders ontstaat een nieuwe groep.
 */
export function groupDesks(room: Room, deskIds: ID[]): ID | null {
  const desks = room.desks.filter((d) => deskIds.includes(d.id));
  if (desks.length < 2) return null;
  const existing = [...new Set(desks.map((d) => d.groupId).filter((g): g is ID => !!g))];
  const affected = new Set(existing);
  let target: DeskGroup;
  if (existing.length >= 1) {
    // Voeg samen in de groep met de meeste geselecteerde tafels.
    const best = existing
      .map((id) => ({ id, n: desks.filter((d) => d.groupId === id).length }))
      .sort((a, b) => b.n - a.n)[0];
    target = room.groups.find((g) => g.id === best.id)!;
  } else {
    target = createGroup(room);
  }
  desks.forEach((d) => (d.groupId = target.id));
  cleanupGroups(room);
  recomputeGroupRelations(room, target.id);
  affected.forEach((g) => g !== target.id && recomputeGroupRelations(room, g));
  return target.id;
}

export function ungroupDesks(room: Room, deskIds: ID[]): void {
  const affected = new Set<ID>();
  room.desks.forEach((d) => {
    if (deskIds.includes(d.id) && d.groupId) {
      affected.add(d.groupId);
      d.groupId = null;
    }
  });
  cleanupGroups(room);
  affected.forEach((g) => recomputeGroupRelations(room, g));
}

export function dissolveGroup(room: Room, groupId: ID): void {
  room.desks.forEach((d) => {
    if (d.groupId === groupId) d.groupId = null;
  });
  room.groups = room.groups.filter((g) => g.id !== groupId);
}

/** Verwijdert tafels (en hun zitplaatsen). Retourneert de ID's van de verwijderde zitplaatsen. */
export function removeDesks(room: Room, deskIds: ID[]): ID[] {
  const set = new Set(deskIds);
  const affected = new Set<ID>();
  room.desks.forEach((d) => set.has(d.id) && d.groupId && affected.add(d.groupId));
  const removedSeats = room.seats.filter((s) => set.has(s.deskId)).map((s) => s.id);
  room.desks = room.desks.filter((d) => !set.has(d.id));
  room.seats = room.seats.filter((s) => !set.has(s.deskId));
  cleanupGroups(room);
  affected.forEach((g) => recomputeGroupRelations(room, g));
  return removedSeats;
}

export function removeObjects(room: Room, ids: ID[]): void {
  room.objects = room.objects.filter((o) => !ids.includes(o.id));
}

/** Groepen waarvan slechts een deel van de tafels in `deskIds` zit (relaties moeten opnieuw bepaald). */
function partiallyAffectedGroups(room: Room, deskIds: Set<ID>): ID[] {
  const out: ID[] = [];
  for (const g of room.groups) {
    const members = room.desks.filter((d) => d.groupId === g.id);
    const moved = members.filter((d) => deskIds.has(d.id)).length;
    if (moved > 0 && moved < members.length) out.push(g.id);
  }
  return out;
}

/**
 * Verplaatst tafels en objecten. Wordt een hele groep verplaatst, dan blijven de vastgelegde relaties
 * ongewijzigd; wordt een deel van een groep verplaatst, dan worden de relaties opnieuw bepaald.
 */
export function moveItems(room: Room, ids: ID[], dx: number, dy: number): void {
  const set = new Set(ids);
  room.desks.forEach((d) => {
    if (set.has(d.id)) {
      d.x += dx;
      d.y += dy;
    }
  });
  room.objects.forEach((o) => {
    if (set.has(o.id)) {
      o.x += dx;
      o.y += dy;
    }
  });
  partiallyAffectedGroups(room, set).forEach((g) => recomputeGroupRelations(room, g));
}

export interface Placement {
  id: ID;
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
}

/** Zet absolute posities (bijv. na een transformatie op het canvas). */
export function applyPlacements(room: Room, placements: Placement[]): void {
  const map = new Map(placements.map((p) => [p.id, p]));
  room.desks.forEach((d) => {
    const p = map.get(d.id);
    if (p) {
      d.x = p.x;
      d.y = p.y;
      d.rotation = normAngle(p.rotation);
    }
  });
  room.objects.forEach((o) => {
    const p = map.get(o.id);
    if (p) {
      o.x = p.x;
      o.y = p.y;
      o.rotation = normAngle(p.rotation);
      if (p.width) o.width = Math.max(5, p.width);
      if (p.height) o.height = Math.max(5, p.height);
    }
  });
  partiallyAffectedGroups(room, new Set(map.keys())).forEach((g) => recomputeGroupRelations(room, g));
}

export function selectionBounds(room: Room, ids: ID[]) {
  const set = new Set(ids);
  const pts: Point[] = [];
  room.desks.filter((d) => set.has(d.id)).forEach((d) => pts.push(...rectCorners(d.x, d.y, d.width, d.height, d.rotation)));
  room.objects.filter((o) => set.has(o.id)).forEach((o) => pts.push(...rectCorners(o.x, o.y, o.width, o.height, o.rotation)));
  return boundsOf(pts);
}

/** Draait de selectie als geheel rond het middelpunt van de selectie. */
export function rotateItems(room: Room, ids: ID[], angle: number): void {
  if (ids.length === 0) return;
  const b = selectionBounds(room, ids);
  const pivot = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const set = new Set(ids);
  const items: { x: number; y: number; rotation: number }[] = [
    ...room.desks.filter((d) => set.has(d.id)),
    ...room.objects.filter((o) => set.has(o.id)),
  ];
  items.forEach((it) => {
    const p = rotateAround({ x: it.x, y: it.y }, pivot, angle);
    it.x = Math.round(p.x * 100) / 100;
    it.y = Math.round(p.y * 100) / 100;
    it.rotation = normAngle(it.rotation + angle);
  });
  partiallyAffectedGroups(room, set).forEach((g) => recomputeGroupRelations(room, g));
}

/**
 * Dupliceert tafels en objecten met een kleine verschuiving. Volledig geselecteerde groepen
 * worden als nieuwe groep gedupliceerd (met dezelfde relaties); losse kopieën uit een
 * gedeeltelijk geselecteerde groep worden losse tafels. Retourneert de nieuwe ID's.
 */
export function duplicateItems(room: Room, ids: ID[], offset = 40): ID[] {
  const set = new Set(ids);
  const newIds: ID[] = [];
  const groupMap = new Map<ID, ID>();
  const fullGroups = room.groups.filter((g) => {
    const members = room.desks.filter((d) => d.groupId === g.id);
    return members.length > 0 && members.every((d) => set.has(d.id));
  });
  const deskMap = new Map<ID, ID>();
  for (const g of fullGroups) {
    const ng = createGroup(room);
    ng.color = g.color;
    groupMap.set(g.id, ng.id);
  }
  for (const d of room.desks.filter((x) => set.has(x.id))) {
    const gid = d.groupId ? (groupMap.get(d.groupId) ?? null) : null;
    const nd = addDesk(room, d.x + offset, d.y + offset, d.rotation, gid);
    nd.width = d.width;
    nd.height = d.height;
    deskMap.set(d.id, nd.id);
    newIds.push(nd.id);
  }
  for (const g of fullGroups) {
    const ng = room.groups.find((x) => x.id === groupMap.get(g.id))!;
    ng.relations = g.relations
      .filter((r) => deskMap.has(r.a) && deskMap.has(r.b))
      .map((r) => ({ a: deskMap.get(r.a)!, b: deskMap.get(r.b)!, kind: r.kind }));
  }
  for (const o of room.objects.filter((x) => set.has(x.id))) {
    const no: RoomObject = { ...o, id: createId('obj'), x: o.x + offset, y: o.y + offset };
    room.objects.push(no);
    newIds.push(no.id);
  }
  return newIds;
}

export function addObject(room: Room, type: RoomObjectType, x: number, y: number, rotation = 0): RoomObject {
  const def = OBJECT_DEFAULTS[type];
  const obj: RoomObject = {
    id: createId('obj'),
    type,
    x,
    y,
    width: def.width,
    height: def.height,
    rotation,
    label: def.label,
  };
  room.objects.push(obj);
  return obj;
}

/** Hernummert zitplaatsen van voor naar achter en van links naar rechts. */
export function renumberSeats(room: Room, order: ID[]): void {
  const pos = new Map(order.map((id, i) => [id, i]));
  room.seats.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  room.seats.forEach((s, i) => (s.number = i + 1));
}

/** Vind een vrije plek voor een nieuw element: midden van het lokaal, licht verschoven als daar al iets staat. */
export function findFreeSpot(room: Room, w: number, h: number): Point {
  const cx = room.width / 2;
  const cy = room.height / 2;
  for (let ring = 0; ring < 12; ring++) {
    for (let k = 0; k < Math.max(1, ring * 8); k++) {
      const a = (k / Math.max(1, ring * 8)) * Math.PI * 2;
      const p = { x: cx + Math.cos(a) * ring * 45, y: cy + Math.sin(a) * ring * 45 };
      const free = room.desks.every((d) => Math.abs(d.x - p.x) > (d.width + w) / 2 || Math.abs(d.y - p.y) > (d.height + h) / 2);
      if (free && p.x > w / 2 && p.y > h / 2 && p.x < room.width - w / 2 && p.y < room.height - h / 2) {
        return { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
      }
    }
  }
  return { x: cx, y: cy };
}
