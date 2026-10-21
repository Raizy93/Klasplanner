import { CHAIR_OFFSET } from '../../models/constants';
import type { Desk, Room, Side } from '../../models/types';
import { rotate, type Point } from '../../utils/geometry';

/** De plek waar de leerling zit (midden van de stoel), in lokaalcoördinaten. */
export function studentPosition(desk: Desk): Point {
  const o = rotate({ x: 0, y: CHAIR_OFFSET }, desk.rotation);
  return { x: desk.x + o.x, y: desk.y + o.y };
}

/**
 * Bepaalt de voorkant van het lokaal. Bij 'auto' is dat de wand die het dichtst bij het digibord ligt;
 * zonder digibord is het de bovenkant.
 */
export function resolveFront(room: Room): Side {
  if (room.front !== 'auto') return room.front;
  const board = room.objects.find((o) => o.type === 'whiteboard');
  if (!board) return 'top';
  const dists: [Side, number][] = [
    ['top', board.y],
    ['bottom', room.height - board.y],
    ['left', board.x],
    ['right', room.width - board.x],
  ];
  dists.sort((a, b) => a[1] - b[1]);
  return dists[0][0];
}

/** Rotatie (graden) waarbij een tafel met de leerling naar de voorkant kijkt. */
export function frontRotation(front: Side): number {
  switch (front) {
    case 'top':
      return 0;
    case 'right':
      return 90;
    case 'bottom':
      return 180;
    case 'left':
      return 270;
  }
}

/**
 * Diepte: 0 = dicht bij de voorkant, groter = verder naar achteren.
 * Lateraal: klein = links, groot = rechts, gezien vanuit de leerlingen die naar de voorkant kijken.
 */
export function depthAndLateral(p: Point, front: Side): { depth: number; lateral: number } {
  switch (front) {
    case 'top':
      return { depth: p.y, lateral: p.x };
    case 'bottom':
      return { depth: -p.y, lateral: -p.x };
    case 'left':
      return { depth: p.x, lateral: -p.y };
    case 'right':
      return { depth: -p.x, lateral: p.y };
  }
}

export interface ZoneFlags {
  front: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  middle: boolean;
}

export interface ZoneBounds {
  depthMin: number;
  depthMax: number;
  latMin: number;
  latMax: number;
}

/**
 * Zones worden berekend uit de posities van alle beschikbare zitplaatsen:
 * het bereik (van voorste tot achterste zitplaats) wordt in drie gelijke stroken verdeeld.
 *  - vooraan:  voorste derde     - achteraan: achterste derde
 *  - links / midden / rechts:    drie gelijke stroken van links naar rechts
 * Staan alle zitplaatsen op één rij, dan geldt iedere plaats zowel als vooraan als achteraan.
 */
export function computeZones(
  positions: Point[],
  front: Side,
): { flags: ZoneFlags[]; bounds: ZoneBounds | null } {
  if (positions.length === 0) return { flags: [], bounds: null };
  const dl = positions.map((p) => depthAndLateral(p, front));
  const depthMin = Math.min(...dl.map((v) => v.depth));
  const depthMax = Math.max(...dl.map((v) => v.depth));
  const latMin = Math.min(...dl.map((v) => v.lateral));
  const latMax = Math.max(...dl.map((v) => v.lateral));
  const dRange = depthMax - depthMin;
  const lRange = latMax - latMin;
  const EPS = 1e-6;
  const flags = dl.map(({ depth, lateral }) => {
    const td = dRange < 1 ? 0.5 : (depth - depthMin) / dRange;
    const tl = lRange < 1 ? 0.5 : (lateral - latMin) / lRange;
    return {
      front: dRange < 1 ? true : td <= 1 / 3 + EPS,
      back: dRange < 1 ? true : td >= 2 / 3 - EPS,
      left: lRange < 1 ? false : tl <= 1 / 3 + EPS,
      right: lRange < 1 ? false : tl >= 2 / 3 - EPS,
      middle: lRange < 1 ? true : tl > 1 / 3 + EPS && tl < 2 / 3 - EPS,
    };
  });
  return { flags, bounds: { depthMin, depthMax, latMin, latMax } };
}

export const SIDE_LABELS: Record<Side, string> = {
  top: 'Boven',
  bottom: 'Onder',
  left: 'Links',
  right: 'Rechts',
};
