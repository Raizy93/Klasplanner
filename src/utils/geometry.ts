export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Normaliseert een hoek naar [0, 360). */
export function normAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Kleinste verschil tussen twee hoeken, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = normAngle(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Roteert een vector met de klok mee (schermcoördinaten, y omlaag). */
export function rotate(p: Point, deg: number): Point {
  const r = toRad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rotateAround(p: Point, pivot: Point, deg: number): Point {
  const v = rotate({ x: p.x - pivot.x, y: p.y - pivot.y }, deg);
  return { x: pivot.x + v.x, y: pivot.y + v.y };
}

/** Hoekpunten van een gedraaide rechthoek met middelpunt (cx, cy). */
export function rectCorners(cx: number, cy: number, w: number, h: number, rotation: number): Point[] {
  return [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((p) => {
    const r = rotate(p, rotation);
    return { x: cx + r.x, y: cy + r.y };
  });
}

export function boundsOf(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Ligt punt p binnen een gedraaide rechthoek? */
export function pointInRotatedRect(
  p: Point,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotation: number,
): boolean {
  const local = rotate({ x: p.x - cx, y: p.y - cy }, -rotation);
  return Math.abs(local.x) <= w / 2 && Math.abs(local.y) <= h / 2;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export const snap = (v: number, grid: number) => Math.round(v / grid) * grid;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const round1 = (v: number) => Math.round(v * 10) / 10;
