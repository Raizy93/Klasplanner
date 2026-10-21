import type { Desk, DeskRelation, RelationKind } from '../../models/types';
import { angleDiff, rotate, type Point } from '../../utils/geometry';

/**
 * Bepaalt de relatie tussen twee tafels op basis van hun onderlinge geometrie,
 * uitgedrukt in het lokale assenstelsel van tafel A. Hierdoor is de uitkomst
 * onafhankelijk van verplaatsen of draaien van het geheel (rigide transformatie).
 *
 * Definities (stoel aan lokale +y-zijde, leerling kijkt naar -y):
 *  - naast:      zelfde richting, tafels zij-aan-zij (verschuiving ≈ één tafelbreedte langs x).
 *  - tegenover:  tegengestelde richting, tafel B ligt recht vóór A (verschuiving ≈ één tafeldiepte langs -y).
 *  - ambiguous:  tafels raken elkaar, maar de stand is niet eenduidig (bijv. 90° gedraaid of half verschoven).
 *  - null:       geen relatie (te ver weg, diagonaal, achter elkaar).
 */

const ANGLE_TOL = 8; // graden
const NEAR_TOL = 14; // eenheden marge om "raken" te bepalen
const ALIGN_TOL = 0.22; // fractie van tafelmaat voor uitlijning
const MIN_DIST = 0.8; // fractie: minimale afstand voor zij-aan-zij / tegenover
const MAX_DIST = 1.35; // fractie: maximale afstand

function near(v: number, target: number, size: number): boolean {
  return v >= target - (1 - MIN_DIST) * size && v <= target + (MAX_DIST - 1) * size;
}

/** SAT-test: overlappen twee gedraaide rechthoeken (met marge `inflate`)? */
export function rotatedRectsTouch(a: Desk, b: Desk, inflate = NEAR_TOL): boolean {
  const rects = [a, b].map((d) => ({
    c: { x: d.x, y: d.y },
    hw: d.width / 2 + inflate / 2,
    hh: d.height / 2 + inflate / 2,
    axes: [rotate({ x: 1, y: 0 }, d.rotation), rotate({ x: 0, y: 1 }, d.rotation)],
  }));
  const [ra, rb] = rects;
  const axes = [...ra.axes, ...rb.axes];
  const delta: Point = { x: rb.c.x - ra.c.x, y: rb.c.y - ra.c.y };
  for (const axis of axes) {
    const proj = (r: typeof ra) =>
      r.hw * Math.abs(r.axes[0].x * axis.x + r.axes[0].y * axis.y) +
      r.hh * Math.abs(r.axes[1].x * axis.x + r.axes[1].y * axis.y);
    const dist = Math.abs(delta.x * axis.x + delta.y * axis.y);
    if (dist > proj(ra) + proj(rb)) return false;
  }
  return true;
}

export function classifyDeskPair(a: Desk, b: Desk): RelationKind | null {
  if (!rotatedRectsTouch(a, b)) return null;
  const W = (a.width + b.width) / 2;
  const H = (a.height + b.height) / 2;
  const d = rotate({ x: b.x - a.x, y: b.y - a.y }, -a.rotation);
  const delta = Math.abs(angleDiff(a.rotation, b.rotation));
  const sameDir = delta <= ANGLE_TOL;
  const reverse = delta >= 180 - ANGLE_TOL;
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const alignedY = ay <= ALIGN_TOL * H;
  const alignedX = ax <= ALIGN_TOL * W;
  const sideBySide = alignedY && near(ax, W, W);
  const frontBack = alignedX && near(ay, H, H);
  const diagonal = near(ax, W, W) && near(ay, H, H);

  if (sameDir) {
    if (sideBySide) return 'beside';
    if (frontBack || diagonal) return null; // achter elkaar of schuin: geen relatie
    return 'ambiguous';
  }
  if (reverse) {
    // B ligt vóór A (aan de -y-kant, waar A naartoe kijkt) → tegenover.
    if (alignedX && near(-d.y, H, H)) return 'opposite';
    if (sideBySide || diagonal) return null; // zigzag of schuin tegenover: geen relatie
    return 'ambiguous'; // bijv. rug-aan-rug met botsende stoelen of half verschoven
  }
  return 'ambiguous'; // bijv. 90° gedraaid tegen elkaar aan
}

/** Berekent alle relaties tussen de opgegeven tafels (doorgaans de tafels van één groep). */
export function computeRelations(desks: Desk[]): DeskRelation[] {
  const out: DeskRelation[] = [];
  const sorted = [...desks].sort((p, q) => (p.id < q.id ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const kind = classifyDeskPair(sorted[i], sorted[j]);
      if (kind) out.push({ a: sorted[i].id, b: sorted[j].id, kind });
    }
  }
  return out;
}

export const RELATION_LABELS: Record<RelationKind, string> = {
  beside: 'naast elkaar',
  opposite: 'tegenover elkaar',
  ambiguous: 'niet eenduidig',
};
