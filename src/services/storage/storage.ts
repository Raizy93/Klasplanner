import { SCHEMA_VERSION, type PersistedData, type Plan } from '../../models/types';
import { validatePlan } from '../../validation/planValidation';
import { createId } from '../../utils/id';

/**
 * Lokale opslag in localStorage. Alles blijft in de browser van de gebruiker;
 * er wordt niets naar een server gestuurd.
 */

export const STORAGE_KEY = 'klassenplanner:data';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = '__kp_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null; // bijv. geblokkeerd in een iframe of privévenster
  }
}

/** Migraties per schemaversie. Nu nog leeg; nieuwe versies voegen hier een stap toe. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version < 1) {
    // Versie 0 bestond niet publiekelijk; behandel als versie 1.
    return { ...raw, schemaVersion: 1 };
  }
  return raw;
}

export interface LoadResult {
  data: PersistedData | null;
  warnings: string[];
  error?: string;
}

export function loadData(storage: StorageLike | null): LoadResult {
  if (!storage) return { data: null, warnings: [], error: 'Lokale opslag is niet beschikbaar in deze browser.' };
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: null, warnings: [], error: 'Lokale opslag kon niet worden gelezen.' };
  }
  if (!text) return { data: null, warnings: [] };
  try {
    const parsed = migrate(JSON.parse(text));
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
      return { data: null, warnings: [], error: 'De opgeslagen gegevens komen van een nieuwere versie van Klassenplanner.' };
    }
    const warnings: string[] = [];
    const plans: Plan[] = [];
    for (const p of Array.isArray(parsed.plans) ? parsed.plans : []) {
      const r = validatePlan(p);
      if (r.ok) {
        plans.push(r.value);
        warnings.push(...r.warnings);
      } else warnings.push(`Een opgeslagen plattegrond kon niet worden geladen: ${r.errors.join(', ')}`);
    }
    const active = typeof parsed.activePlanId === 'string' && plans.some((p) => p.id === parsed.activePlanId)
      ? (parsed.activePlanId as string)
      : (plans[0]?.id ?? null);
    return { data: { schemaVersion: SCHEMA_VERSION, activePlanId: active, plans }, warnings };
  } catch {
    // Bewaar de beschadigde gegevens apart, zodat ze niet stilzwijgend verloren gaan.
    try {
      storage.setItem(`${STORAGE_KEY}:beschadigd:${Date.now()}`, text);
    } catch {
      /* negeren */
    }
    return { data: null, warnings: [], error: 'De opgeslagen gegevens waren beschadigd. Er is een reservekopie bewaard.' };
  }
}

export function saveData(storage: StorageLike | null, data: PersistedData): { ok: boolean; error?: string } {
  if (!storage) return { ok: false, error: 'Lokale opslag is niet beschikbaar.' };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Opslaan mislukt: de opslagruimte van de browser is mogelijk vol.' };
  }
}

// ---------- JSON-import en -export ----------

export const EXPORT_APP_ID = 'klassenplanner';

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  plans: Plan[];
}

export function serializePlans(plans: Plan[]): string {
  const file: ExportFile = {
    app: EXPORT_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    plans,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult = { ok: true; plans: Plan[]; warnings: string[] } | { ok: false; error: string };

/**
 * Leest een exportbestand. Geïmporteerde plattegronden krijgen een nieuw ID,
 * zodat bestaande gegevens nooit worden overschreven.
 */
export function parseImport(text: string, existingNames: string[] = []): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dit bestand is geen geldig JSON-bestand.' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Het bestand bevat geen plattegrond.' };
  const obj = raw as Record<string, unknown>;
  if (obj.app !== EXPORT_APP_ID) return { ok: false, error: 'Dit bestand is niet gemaakt met Klassenplanner.' };
  if (typeof obj.schemaVersion !== 'number') return { ok: false, error: 'De schemaversie ontbreekt in het bestand.' };
  if (obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: `Dit bestand gebruikt schemaversie ${obj.schemaVersion}; deze versie van Klassenplanner ondersteunt t/m versie ${SCHEMA_VERSION}.` };
  }
  const migrated = migrate(obj);
  const list = Array.isArray(migrated.plans) ? migrated.plans : [];
  if (list.length === 0) return { ok: false, error: 'Het bestand bevat geen plattegronden.' };
  const plans: Plan[] = [];
  const warnings: string[] = [];
  const names = new Set(existingNames);
  for (const p of list) {
    const r = validatePlan(p);
    if (!r.ok) return { ok: false, error: `Het bestand is ongeldig: ${r.errors.join(', ')}` };
    warnings.push(...r.warnings);
    let name = r.value.name;
    if (names.has(name)) name = `${name} (geïmporteerd)`;
    names.add(name);
    plans.push({ ...r.value, id: createId('plan'), name, updatedAt: Date.now() });
  }
  return { ok: true, plans, warnings };
}
