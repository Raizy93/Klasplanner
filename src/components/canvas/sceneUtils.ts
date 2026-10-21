import { WALL_THICKNESS } from '../../models/constants';
import type { Desk, Room } from '../../models/types';
import { normAngle, pointInRotatedRect, type Point, type Rect } from '../../utils/geometry';

/** Rotatie voor tekst binnen een gedraaid element, zodat tekst nooit op z'n kop staat. */
export function uprightRotation(rotation: number): number {
  const r = normAngle(rotation);
  return r > 90 && r <= 270 ? 180 : 0;
}

/** Lettergrootte die een naam zo goed mogelijk in de beschikbare breedte laat passen. */
export function fitFontSize(text: string, width: number, max = 14, min = 9): number {
  const est = width / Math.max(1, text.length * 0.6);
  return Math.max(min, Math.min(max, Math.floor(est)));
}

/** Zichtbaar kader rond het lokaal (inclusief muren en een kleine marge). */
export function roomFrame(room: Room, margin = 24): Rect {
  const m = WALL_THICKNESS + margin;
  return { x: -m, y: -m, width: room.width + 2 * m, height: room.height + 2 * m };
}

/** Schaal en positie om het lokaal passend in een viewport te tonen. */
export function fitView(room: Room, vw: number, vh: number): { scale: number; x: number; y: number } {
  const f = roomFrame(room, 30);
  const scale = Math.max(0.15, Math.min(3, Math.min(vw / f.width, vh / f.height)));
  return {
    scale,
    x: (vw - f.width * scale) / 2 - f.x * scale,
    y: (vh - f.height * scale) / 2 - f.y * scale,
  };
}

/** Welke tafel ligt onder dit punt (inclusief stoelzone)? */
export function deskAtPoint(desks: Desk[], p: Point): Desk | null {
  for (let i = desks.length - 1; i >= 0; i--) {
    const d = desks[i];
    if (pointInRotatedRect(p, d.x, d.y, d.width + 6, d.height + 6, d.rotation)) return d;
  }
  return null;
}
