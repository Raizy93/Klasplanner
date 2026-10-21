/**
 * Centrale datatypes van Klassenplanner.
 *
 * Tafels, zitplaatsen en leerlingen zijn bewust afzonderlijke objecten met eigen stabiele ID's.
 * Zo kan een nieuwe indeling worden gegenereerd zonder de lokaalindeling aan te raken,
 * en kunnen twee leerlingen dezelfde naam hebben.
 */

export type ID = string;

/** Zijde van het lokaal. */
export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Student {
  id: ID;
  name: string;
  /** Index in het pastelpalet (zie constants.ts). */
  color: number;
  absent: boolean;
  createdAt: number;
}

/**
 * Een tafel. Coördinaten zijn het middelpunt in lokaal-eenheden (1 eenheid ≈ 1 cm).
 * In het lokale assenstelsel van de tafel zit de stoel aan de onderkant (+y) en kijkt de leerling naar -y.
 * Rotatie in graden, met de klok mee (zoals Konva).
 */
export interface Desk {
  id: ID;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  groupId: ID | null;
}

/** Zitplaats hoort bij precies één tafel. `number` is het zichtbare, stabiele zitplaatsnummer. */
export interface Seat {
  id: ID;
  deskId: ID;
  number: number;
  /** Niet-beschikbare zitplaats: wordt door de generator overgeslagen. */
  disabled: boolean;
}

export type RelationKind = 'beside' | 'opposite' | 'ambiguous';

/**
 * Expliciet vastgelegde relatie tussen twee tafels binnen dezelfde groep.
 * `ambiguous` = de tafels raken elkaar, maar de relatie is niet eenduidig vast te stellen.
 */
export interface DeskRelation {
  a: ID;
  b: ID;
  kind: RelationKind;
}

export interface DeskGroup {
  id: ID;
  name: string;
  color: number;
  /** Relaties tussen tafels van deze groep. Blijven geldig bij verplaatsen/draaien van de hele groep. */
  relations: DeskRelation[];
}

export type RoomObjectType = 'whiteboard' | 'teacherDesk' | 'door' | 'window' | 'cabinet' | 'plant';

export interface RoomObject {
  id: ID;
  type: RoomObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
}

export type FrontSetting = 'auto' | Side;

export interface Room {
  width: number;
  height: number;
  front: FrontSetting;
  desks: Desk[];
  seats: Seat[];
  groups: DeskGroup[];
  objects: RoomObject[];
}

export type RuleType =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'middle'
  | 'beside'
  | 'notBeside'
  | 'sameGroup'
  | 'notSameGroup'
  | 'opposite'
  | 'notOpposite'
  | 'atSeat'
  | 'notAtSeat';

export type Priority = 'hard' | 'soft';

/** 1 = lage voorkeur, 2 = normale voorkeur, 3 = sterke voorkeur. */
export type Strength = 1 | 2 | 3;

export interface Rule {
  id: ID;
  type: RuleType;
  studentA: ID;
  studentB?: ID;
  seatId?: ID;
  priority: Priority;
  strength: Strength;
  enabled: boolean;
  createdAt: number;
}

/** Huidige indeling: zitplaats-ID → leerling-ID. Vastgezette leerlingen in `locked`. */
export interface Arrangement {
  assignments: Record<ID, ID>;
  locked: ID[];
}

export interface SavedArrangement {
  id: ID;
  name: string;
  createdAt: number;
  arrangement: Arrangement;
}

export interface GeneratorSettings {
  /** Voorkeuren zo goed mogelijk optimaliseren (local search). */
  optimizePreferences: boolean;
  /** Extra variatie tussen opeenvolgende indelingen. */
  extraVariation: boolean;
  /** Vastgezette leerlingen op hun plek houden. */
  keepLocked: boolean;
}

export interface Plan {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  students: Student[];
  room: Room;
  rules: Rule[];
  arrangement: Arrangement;
  savedArrangements: SavedArrangement[];
  settings: GeneratorSettings;
}

export const SCHEMA_VERSION = 1;

export interface PersistedData {
  schemaVersion: number;
  activePlanId: ID | null;
  plans: Plan[];
}
