import { DEFAULT_SETTINGS, PALETTE } from '../models/constants';
import type {
  Arrangement,
  Desk,
  DeskGroup,
  DeskRelation,
  Plan,
  Room,
  RoomObject,
  RoomObjectType,
  Rule,
  RuleType,
  SavedArrangement,
  Seat,
  Student,
} from '../models/types';
import { RULE_META } from '../services/rules/ruleMeta';

/**
 * Strikte validatie van plattegronden uit localStorage of een importbestand.
 * Essentiële fouten leiden tot afwijzing; kleine onvolkomenheden worden veilig gerepareerd
 * (bijv. dubbele toewijzingen of verwijzingen naar niet-bestaande objecten).
 */

export type ValidationResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, field: string, maxLen = 500): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) throw new Invalid(`Ongeldig veld: ${field}`);
  return v;
}
function num(v: unknown, field: string, fallback?: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (fallback !== undefined) return fallback;
  throw new Invalid(`Ongeldig getal: ${field}`);
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function arr(v: unknown, field: string): unknown[] {
  if (!Array.isArray(v)) throw new Invalid(`Ontbrekende lijst: ${field}`);
  return v;
}

const OBJECT_TYPES: RoomObjectType[] = ['whiteboard', 'teacherDesk', 'door', 'window', 'cabinet', 'plant'];
const SIDES = ['top', 'bottom', 'left', 'right'];

function parseStudent(v: unknown, i: number): Student {
  if (!isObj(v)) throw new Invalid(`Leerling ${i + 1} is ongeldig`);
  return {
    id: str(v.id, 'leerling.id', 100),
    name: str(v.name, 'leerling.naam', 100),
    color: Math.abs(Math.round(num(v.color, 'kleur', i))) % PALETTE.length,
    absent: bool(v.absent, false),
    createdAt: num(v.createdAt, 'createdAt', Date.now()),
  };
}

function parseDesk(v: unknown): Desk {
  if (!isObj(v)) throw new Invalid('Ongeldige tafel');
  return {
    id: str(v.id, 'tafel.id', 100),
    x: num(v.x, 'tafel.x'),
    y: num(v.y, 'tafel.y'),
    rotation: num(v.rotation, 'tafel.rotatie', 0),
    width: Math.max(10, num(v.width, 'tafel.breedte', 70)),
    height: Math.max(10, num(v.height, 'tafel.diepte', 50)),
    groupId: typeof v.groupId === 'string' ? v.groupId : null,
  };
}

function parseRoom(v: unknown, warnings: string[]): Room {
  if (!isObj(v)) throw new Invalid('Lokaalgegevens ontbreken');
  const desks = arr(v.desks, 'tafels').map(parseDesk);
  const deskIds = new Set(desks.map((d) => d.id));
  if (deskIds.size !== desks.length) throw new Invalid('Dubbele tafel-ID gevonden');

  const seenDesk = new Set<string>();
  const seats: Seat[] = [];
  for (const s of arr(v.seats, 'zitplaatsen')) {
    if (!isObj(s)) throw new Invalid('Ongeldige zitplaats');
    const seat: Seat = {
      id: str(s.id, 'zitplaats.id', 100),
      deskId: str(s.deskId, 'zitplaats.tafel', 100),
      number: Math.round(num(s.number, 'zitplaats.nummer')),
      disabled: bool(s.disabled, false),
    };
    if (!deskIds.has(seat.deskId) || seenDesk.has(seat.deskId)) {
      warnings.push(`Zitplaats ${seat.number} verwees naar een ontbrekende of dubbele tafel en is verwijderd.`);
      continue;
    }
    seenDesk.add(seat.deskId);
    seats.push(seat);
  }
  // Iedere tafel moet een zitplaats hebben.
  let maxNr = seats.reduce((m, s) => Math.max(m, s.number), 0);
  for (const d of desks) {
    if (!seenDesk.has(d.id)) {
      seats.push({ id: `seat_rep_${d.id}`, deskId: d.id, number: ++maxNr, disabled: false });
      warnings.push('Een tafel zonder zitplaats is hersteld.');
    }
  }

  const groups: DeskGroup[] = arr(v.groups ?? [], 'groepen').map((g) => {
    if (!isObj(g)) throw new Invalid('Ongeldige groep');
    const relations: DeskRelation[] = arr(g.relations ?? [], 'relaties')
      .filter(isObj)
      .filter((r) => deskIds.has(r.a as string) && deskIds.has(r.b as string))
      .filter((r) => r.kind === 'beside' || r.kind === 'opposite' || r.kind === 'ambiguous')
      .map((r) => ({ a: r.a as string, b: r.b as string, kind: r.kind as DeskRelation['kind'] }));
    return {
      id: str(g.id, 'groep.id', 100),
      name: typeof g.name === 'string' && g.name ? g.name.slice(0, 60) : 'Groep',
      color: Math.abs(Math.round(num(g.color, 'groep.kleur', 0))) % PALETTE.length,
      relations,
    };
  });
  const groupIds = new Set(groups.map((g) => g.id));
  desks.forEach((d) => {
    if (d.groupId && !groupIds.has(d.groupId)) d.groupId = null;
  });

  const objects: RoomObject[] = arr(v.objects ?? [], 'objecten').map((o) => {
    if (!isObj(o)) throw new Invalid('Ongeldig object');
    const type = o.type as RoomObjectType;
    if (!OBJECT_TYPES.includes(type)) throw new Invalid(`Onbekend objecttype: ${String(o.type)}`);
    return {
      id: str(o.id, 'object.id', 100),
      type,
      x: num(o.x, 'object.x'),
      y: num(o.y, 'object.y'),
      width: Math.max(5, num(o.width, 'object.breedte', 50)),
      height: Math.max(5, num(o.height, 'object.hoogte', 20)),
      rotation: num(o.rotation, 'object.rotatie', 0),
      label: typeof o.label === 'string' ? o.label.slice(0, 60) : undefined,
    };
  });

  const front = v.front === 'auto' || SIDES.includes(v.front as string) ? (v.front as Room['front']) : 'auto';
  return {
    width: Math.min(5000, Math.max(200, num(v.width, 'lokaal.breedte', 900))),
    height: Math.min(5000, Math.max(200, num(v.height, 'lokaal.hoogte', 760))),
    front,
    desks,
    seats,
    groups,
    objects,
  };
}

function parseRule(v: unknown): Rule {
  if (!isObj(v)) throw new Invalid('Ongeldige regel');
  const type = v.type as RuleType;
  if (!(type in RULE_META)) throw new Invalid(`Onbekend regeltype: ${String(v.type)}`);
  const strength = [1, 2, 3].includes(v.strength as number) ? (v.strength as 1 | 2 | 3) : 2;
  return {
    id: str(v.id, 'regel.id', 100),
    type,
    studentA: str(v.studentA, 'regel.leerling', 100),
    studentB: typeof v.studentB === 'string' ? v.studentB : undefined,
    seatId: typeof v.seatId === 'string' ? v.seatId : undefined,
    priority: v.priority === 'soft' ? 'soft' : 'hard',
    strength,
    enabled: bool(v.enabled, true),
    createdAt: num(v.createdAt, 'createdAt', Date.now()),
  };
}

function parseArrangement(v: unknown): Arrangement {
  if (!isObj(v)) return { assignments: {}, locked: [] };
  const assignments: Record<string, string> = {};
  if (isObj(v.assignments)) {
    for (const [k, val] of Object.entries(v.assignments)) if (typeof val === 'string') assignments[k] = val;
  }
  const locked = Array.isArray(v.locked) ? v.locked.filter((x): x is string => typeof x === 'string') : [];
  return { assignments, locked };
}

/**
 * Verwijdert verwijzingen naar ontbrekende zitplaatsen/leerlingen en dubbele toewijzingen,
 * en ontgrendelt leerlingen zonder zitplaats.
 */
export function sanitizeArrangement(arrangement: Arrangement, plan: Pick<Plan, 'students' | 'room'>): Arrangement {
  const seatIds = new Set(plan.room.seats.map((s) => s.id));
  const studentIds = new Set(plan.students.map((s) => s.id));
  const seen = new Set<string>();
  const assignments: Record<string, string> = {};
  for (const [seatId, studentId] of Object.entries(arrangement.assignments)) {
    if (!seatIds.has(seatId) || !studentIds.has(studentId) || seen.has(studentId)) continue;
    seen.add(studentId);
    assignments[seatId] = studentId;
  }
  const locked = [...new Set(arrangement.locked)].filter((id) => seen.has(id));
  return { assignments, locked };
}

export function validatePlan(raw: unknown): ValidationResult<Plan> {
  const warnings: string[] = [];
  try {
    if (!isObj(raw)) throw new Invalid('Plattegrond is geen geldig object');
    const students = arr(raw.students, 'leerlingen').map(parseStudent);
    if (new Set(students.map((s) => s.id)).size !== students.length) throw new Invalid('Dubbele leerling-ID gevonden');
    const room = parseRoom(raw.room, warnings);
    const rules = arr(raw.rules ?? [], 'regels').map(parseRule);
    const base = { students, room };
    const arrangement = sanitizeArrangement(parseArrangement(raw.arrangement), base);
    const savedArrangements: SavedArrangement[] = arr(raw.savedArrangements ?? [], 'bewaarde indelingen')
      .filter(isObj)
      .map((s) => ({
        id: str(s.id, 'indeling.id', 100),
        name: typeof s.name === 'string' ? s.name.slice(0, 80) : 'Indeling',
        createdAt: num(s.createdAt, 'createdAt', Date.now()),
        arrangement: sanitizeArrangement(parseArrangement(s.arrangement), base),
      }));
    const st = isObj(raw.settings) ? raw.settings : {};
    const plan: Plan = {
      id: str(raw.id, 'plattegrond.id', 100),
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : 'Naamloze plattegrond',
      createdAt: num(raw.createdAt, 'createdAt', Date.now()),
      updatedAt: num(raw.updatedAt, 'updatedAt', Date.now()),
      students,
      room,
      rules,
      arrangement,
      savedArrangements,
      settings: {
        optimizePreferences: bool(st.optimizePreferences, DEFAULT_SETTINGS.optimizePreferences),
        extraVariation: bool(st.extraVariation, DEFAULT_SETTINGS.extraVariation),
        keepLocked: bool(st.keepLocked, DEFAULT_SETTINGS.keepLocked),
      },
    };
    return { ok: true, value: plan, warnings };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, errors: [e.message] };
    return { ok: false, errors: ['Onverwachte fout bij het lezen van de gegevens.'] };
  }
}
