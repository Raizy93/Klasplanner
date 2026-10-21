import { DEFAULT_ROOM_HEIGHT, DEFAULT_ROOM_WIDTH, DEFAULT_SETTINGS } from '../../models/constants';
import type { Plan, Room } from '../../models/types';
import { createId } from '../../utils/id';
import { addObject } from '../room/roomOps';

export function createEmptyRoom(): Room {
  const room: Room = {
    width: DEFAULT_ROOM_WIDTH,
    height: DEFAULT_ROOM_HEIGHT,
    front: 'auto',
    desks: [],
    seats: [],
    groups: [],
    objects: [],
  };
  // Een digibord bepaalt standaard de voorkant van het lokaal.
  addObject(room, 'whiteboard', room.width / 2, 22);
  return room;
}

export function createEmptyPlan(name: string): Plan {
  const now = Date.now();
  return {
    id: createId('plan'),
    name,
    createdAt: now,
    updatedAt: now,
    students: [],
    room: createEmptyRoom(),
    rules: [],
    arrangement: { assignments: {}, locked: [] },
    savedArrangements: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Diepe kopie met nieuwe plattegrond-ID (interne ID's mogen gelijk blijven: ze zijn per plattegrond). */
export function duplicatePlan(plan: Plan, name: string): Plan {
  const copy: Plan = JSON.parse(JSON.stringify(plan));
  copy.id = createId('plan');
  copy.name = name;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  return copy;
}
