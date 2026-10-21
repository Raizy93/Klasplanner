import type { GeneratorSettings, RoomObjectType } from './types';

/** Standaard tafelafmeting in lokaal-eenheden (≈ cm). */
export const DESK_WIDTH = 70;
export const DESK_HEIGHT = 50;
/** Afstand van tafelmiddelpunt tot de plek waar de leerling zit (midden van de stoel). */
export const CHAIR_OFFSET = DESK_HEIGHT / 2 + 14;

export const GRID_SIZE = 10;
export const DEFAULT_ROOM_WIDTH = 900;
export const DEFAULT_ROOM_HEIGHT = 760;
export const WALL_THICKNESS = 14;

/**
 * Pastelpalet voor leerlingen en groepen. `fill` is licht genoeg voor donkere tekst (contrast > 7:1),
 * `stroke` is de randkleur en `dot` de indicatorkleur in lijsten.
 */
export const PALETTE = [
  { name: 'Groen', fill: '#c9ecd2', stroke: '#5fb57a', dot: '#4caf6e' },
  { name: 'Blauw', fill: '#cfe2fb', stroke: '#6a9ee0', dot: '#4a8ae0' },
  { name: 'Roze', fill: '#fbd3dc', stroke: '#e48aa0', dot: '#e86f8c' },
  { name: 'Geel', fill: '#fbecb5', stroke: '#d9b84a', dot: '#e8c33f' },
  { name: 'Paars', fill: '#e2d8fb', stroke: '#9b86dd', dot: '#9a7ce6' },
  { name: 'Oranje', fill: '#fbdcc2', stroke: '#e09a5f', dot: '#ec9550' },
  { name: 'Turquoise', fill: '#c6ecec', stroke: '#4fb3b3', dot: '#38b2ac' },
] as const;

export const DEFAULT_SETTINGS: GeneratorSettings = {
  optimizePreferences: true,
  extraVariation: false,
  keepLocked: true,
};

export const OBJECT_DEFAULTS: Record<RoomObjectType, { width: number; height: number; label: string }> = {
  whiteboard: { width: 260, height: 18, label: 'Digibord' },
  teacherDesk: { width: 120, height: 70, label: 'Leerkracht' },
  door: { width: 90, height: 14, label: 'Deur' },
  window: { width: 160, height: 10, label: 'Raam' },
  cabinet: { width: 120, height: 45, label: 'Kast' },
  plant: { width: 40, height: 40, label: 'Plant' },
};

export const OBJECT_TYPE_LABELS: Record<RoomObjectType, string> = {
  whiteboard: 'Digibord',
  teacherDesk: 'Leerkrachttafel',
  door: 'Deur',
  window: 'Raam',
  cabinet: 'Kast',
  plant: 'Plant',
};

/** Rekentijd van de generator (ms). */
export const SOLVER_TIME_LIMIT_MS = 4000;
export const OPTIMIZE_TIME_MS = 900;
