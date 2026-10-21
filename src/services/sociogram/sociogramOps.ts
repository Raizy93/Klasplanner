import type { ID, Plan, SocioDimension, SocioResponse, Sociogram } from '../../models/types';

/**
 * Bewerkingen op het sociogram. Muteren het meegegeven plan (voor gebruik binnen een immer-producer).
 */

export function emptySociogram(): Sociogram {
  return { responses: {}, goals: { work: 'none', play: 'none' } };
}

export function emptyResponse(): SocioResponse {
  return { workPos: [], workNeg: [], playPos: [], playNeg: [] };
}

export type ChoiceState = 'none' | 'pos' | 'neg';

const keys = (dim: SocioDimension) =>
  dim === 'work' ? (['workPos', 'workNeg'] as const) : (['playPos', 'playNeg'] as const);

export function choiceOf(resp: SocioResponse | undefined, dim: SocioDimension, target: ID): ChoiceState {
  if (!resp) return 'none';
  const [p, n] = keys(dim);
  if (resp[p].includes(target)) return 'pos';
  if (resp[n].includes(target)) return 'neg';
  return 'none';
}

/** Zet de keuze van `from` over `to` binnen één vraag (positief en negatief sluiten elkaar uit). */
export function setChoice(plan: Plan, from: ID, to: ID, dim: SocioDimension, state: ChoiceState): void {
  if (from === to) return;
  const resp = (plan.sociogram.responses[from] ??= emptyResponse());
  const [p, n] = keys(dim);
  resp[p] = resp[p].filter((x) => x !== to);
  resp[n] = resp[n].filter((x) => x !== to);
  if (state === 'pos') resp[p].push(to);
  if (state === 'neg') resp[n].push(to);
}

/** Volgende stand bij klikken: leeg → graag → liever niet → leeg. */
export function nextChoice(state: ChoiceState): ChoiceState {
  return state === 'none' ? 'pos' : state === 'pos' ? 'neg' : 'none';
}

/** Markeert het formulier als ingevuld (ook zonder keuzes) of verwijdert de antwoorden. */
export function setFilledIn(plan: Plan, student: ID, filled: boolean): void {
  if (filled) plan.sociogram.responses[student] ??= emptyResponse();
  else delete plan.sociogram.responses[student];
}

export function choiceCount(resp: SocioResponse | undefined): number {
  if (!resp) return 0;
  return resp.workPos.length + resp.workNeg.length + resp.playPos.length + resp.playNeg.length;
}

/** Verwijdert een leerling uit alle sociogramantwoorden. */
export function removeStudentFromSociogram(sociogram: Sociogram, student: ID): void {
  delete sociogram.responses[student];
  for (const resp of Object.values(sociogram.responses)) {
    resp.workPos = resp.workPos.filter((x) => x !== student);
    resp.workNeg = resp.workNeg.filter((x) => x !== student);
    resp.playPos = resp.playPos.filter((x) => x !== student);
    resp.playNeg = resp.playNeg.filter((x) => x !== student);
  }
}

/** Ruimt verwijzingen naar niet-bestaande leerlingen, zelfkeuzes, dubbelingen en tegenstrijdigheden op. */
export function sanitizeSociogram(sociogram: Sociogram, studentIds: Set<ID>): Sociogram {
  const responses: Record<ID, SocioResponse> = {};
  const clean = (list: ID[], self: ID, exclude: ID[] = []) =>
    [...new Set(list)].filter((x) => x !== self && studentIds.has(x) && !exclude.includes(x));
  for (const [id, r] of Object.entries(sociogram.responses)) {
    if (!studentIds.has(id)) continue;
    const workPos = clean(r.workPos, id);
    const playPos = clean(r.playPos, id);
    responses[id] = {
      workPos,
      workNeg: clean(r.workNeg, id, workPos),
      playPos,
      playNeg: clean(r.playNeg, id, playPos),
    };
  }
  return { ...sociogram, responses };
}

export const DIMENSION_LABELS: Record<SocioDimension, string> = { work: 'Samenwerken', play: 'Samen spelen' };
