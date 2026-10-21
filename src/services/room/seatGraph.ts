import type { ID, Room, Side } from '../../models/types';
import type { Point } from '../../utils/geometry';
import { computeZones, resolveFront, studentPosition, type ZoneBounds, type ZoneFlags } from './zones';

export interface SeatInfo {
  seatId: ID;
  deskId: ID;
  number: number;
  disabled: boolean;
  /** Groepssleutel; een losse tafel vormt een eigen "groep" van één. */
  groupKey: string;
  groupId: ID | null;
  pos: Point;
  zones: ZoneFlags;
}

/**
 * Inventarisatie van alle zitplaatsen met hun onderlinge relaties.
 * Dit is de enige bron voor "naast", "tegenover" en "zelfde groepje" — zowel de generator
 * als de evaluatie van regels gebruiken deze structuur.
 */
export interface SeatGraph {
  seats: SeatInfo[];
  index: Map<ID, number>;
  beside: number[][];
  opposite: number[][];
  /** Paren zitplaatsen waarvan de relatie niet eenduidig is (indices). */
  ambiguous: [number, number][];
  front: Side;
  zoneBounds: ZoneBounds | null;
}

export function buildSeatGraph(room: Room): SeatGraph {
  const front = resolveFront(room);
  const deskById = new Map(room.desks.map((d) => [d.id, d]));
  const validSeats = room.seats
    .filter((s) => deskById.has(s.deskId))
    .sort((a, b) => a.number - b.number);
  const positions = validSeats.map((s) => studentPosition(deskById.get(s.deskId)!));

  // Zones alleen op basis van beschikbare zitplaatsen, zodat uitgeschakelde plaatsen het bereik niet beïnvloeden.
  const enabledIdx = validSeats.map((s, i) => (s.disabled ? -1 : i)).filter((i) => i >= 0);
  const z = computeZones(
    enabledIdx.map((i) => positions[i]),
    front,
  );
  const noZone: ZoneFlags = { front: false, back: false, left: false, right: false, middle: false };
  const zoneFor = new Map<number, ZoneFlags>();
  enabledIdx.forEach((i, k) => zoneFor.set(i, z.flags[k]));

  const seats: SeatInfo[] = validSeats.map((s, i) => {
    const desk = deskById.get(s.deskId)!;
    return {
      seatId: s.id,
      deskId: s.deskId,
      number: s.number,
      disabled: s.disabled,
      groupKey: desk.groupId ?? `solo:${desk.id}`,
      groupId: desk.groupId,
      pos: positions[i],
      zones: zoneFor.get(i) ?? noZone,
    };
  });

  const index = new Map(seats.map((s, i) => [s.seatId, i]));
  const seatOfDesk = new Map(seats.map((s, i) => [s.deskId, i]));
  const beside: number[][] = seats.map(() => []);
  const opposite: number[][] = seats.map(() => []);
  const ambiguous: [number, number][] = [];

  for (const g of room.groups) {
    for (const rel of g.relations) {
      const i = seatOfDesk.get(rel.a);
      const j = seatOfDesk.get(rel.b);
      if (i === undefined || j === undefined) continue;
      // Relaties gelden alleen zolang beide tafels nog in deze groep zitten.
      if (seats[i].groupId !== g.id || seats[j].groupId !== g.id) continue;
      if (rel.kind === 'beside') {
        beside[i].push(j);
        beside[j].push(i);
      } else if (rel.kind === 'opposite') {
        opposite[i].push(j);
        opposite[j].push(i);
      } else {
        ambiguous.push([i, j]);
      }
    }
  }

  return { seats, index, beside, opposite, ambiguous, front, zoneBounds: z.bounds };
}
