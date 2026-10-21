import type { ID, Plan, Rule, SocioDimension, SocioGoal, Strength } from '../../models/types';
import { needsSecondStudent } from '../rules/ruleMeta';
import { analyzeSociogram } from './analysis';
import { DIMENSION_LABELS } from './sociogramOps';

/**
 * Regelvoorstellen op basis van het sociogram. De tool voegt nooit zelf regels toe:
 * de leerkracht kiest welke voorstellen worden overgenomen.
 *
 * Doelen per vraag:
 *  - reinforce (bestaande relaties bekrachtigen): wederzijds positieve keuzes samen in een groepje.
 *  - build (nieuwe relaties laten ontstaan): eenzijdig positieve keuzes samen (kansrijke nieuwe relatie);
 *    optioneel bestaande vriendschappen juist over groepjes verdelen.
 *  - Bij ieder doel: negatieve relaties (wederzijds negatief, tegengesteld) uit elkaar.
 */

export type SuggestionKind =
  | 'mutualPosTogether'
  | 'oneSidedPosTogether'
  | 'spreadMutualPos'
  | 'mutualNegApart'
  | 'conflictApart'
  | 'oneSidedNegApart';

export interface KindMeta {
  label: string;
  explanation: string;
  type: 'sameGroup' | 'notSameGroup';
  defaultStrength: Strength;
}

export const KIND_META: Record<SuggestionKind, KindMeta> = {
  mutualPosTogether: {
    label: 'Wederzijds positief → samen',
    explanation: 'Leerlingen die elkaar allebei kiezen, komen bij voorkeur in hetzelfde groepje.',
    type: 'sameGroup',
    defaultStrength: 2,
  },
  oneSidedPosTogether: {
    label: 'Eenzijdig positief → samen',
    explanation: 'Een leerling kiest een ander positief en die ander staat er neutraal tegenover: een kansrijke nieuwe relatie.',
    type: 'sameGroup',
    defaultStrength: 1,
  },
  spreadMutualPos: {
    label: 'Bestaande vriendschappen spreiden',
    explanation: 'Leerlingen die elkaar al wederzijds kiezen, juist in verschillende groepjes, zodat er nieuwe contacten ontstaan.',
    type: 'notSameGroup',
    defaultStrength: 1,
  },
  mutualNegApart: {
    label: 'Wederzijds negatief → uit elkaar',
    explanation: 'Leerlingen die elkaar allebei negatief kiezen, niet in hetzelfde groepje.',
    type: 'notSameGroup',
    defaultStrength: 2,
  },
  conflictApart: {
    label: 'Tegengestelde keuze → uit elkaar',
    explanation: 'De één kiest de ander positief, maar de ander kiest juist negatief terug.',
    type: 'notSameGroup',
    defaultStrength: 2,
  },
  oneSidedNegApart: {
    label: 'Eenzijdig negatief → uit elkaar',
    explanation: 'Een leerling kiest een ander negatief; die ander staat er neutraal tegenover.',
    type: 'notSameGroup',
    defaultStrength: 1,
  },
};

/** Welke soorten voorstellen bij een doel horen, en welke standaard aangevinkt zijn. */
export function kindsForGoal(goal: SocioGoal): { kind: SuggestionKind; checked: boolean }[] {
  const negatives = [
    { kind: 'mutualNegApart' as const, checked: true },
    { kind: 'conflictApart' as const, checked: true },
    { kind: 'oneSidedNegApart' as const, checked: false },
  ];
  if (goal === 'reinforce') return [{ kind: 'mutualPosTogether', checked: true }, ...negatives];
  if (goal === 'build') return [{ kind: 'oneSidedPosTogether', checked: true }, { kind: 'spreadMutualPos', checked: false }, ...negatives];
  return negatives;
}

export interface Suggestion {
  /** Stabiele sleutel: dimensie + soort + paar. */
  key: string;
  dimension: SocioDimension;
  kind: SuggestionKind;
  a: ID;
  b: ID;
  type: 'sameGroup' | 'notSameGroup';
  /** Er bestaat al een gelijke regel voor dit paar. */
  exists: boolean;
  /** Er bestaat een regel die het tegenovergestelde vraagt. */
  conflictsWith: Rule | null;
}

const samePair = (r: Rule, a: ID, b: ID) =>
  needsSecondStudent(r.type) && ((r.studentA === a && r.studentB === b) || (r.studentA === b && r.studentB === a));

export function buildSuggestions(plan: Pick<Plan, 'students' | 'sociogram' | 'rules'>, dimension: SocioDimension, goal: SocioGoal): Suggestion[] {
  const an = analyzeSociogram(plan, dimension);
  const out: Suggestion[] = [];
  const add = (kind: SuggestionKind, a: ID, b: ID) => {
    const type = KIND_META[kind].type;
    const opposite = type === 'sameGroup' ? 'notSameGroup' : 'sameGroup';
    const pairRules = plan.rules.filter((r) => samePair(r, a, b));
    out.push({
      key: `${dimension}:${kind}:${[a, b].sort().join('|')}`,
      dimension,
      kind,
      a,
      b,
      type,
      exists: pairRules.some((r) => r.type === type),
      conflictsWith: pairRules.find((r) => r.type === opposite) ?? null,
    });
  };
  for (const { kind } of kindsForGoal(goal)) {
    if (kind === 'mutualPosTogether' || kind === 'spreadMutualPos') an.mutualPos.forEach((p) => add(kind, p.a, p.b));
    if (kind === 'oneSidedPosTogether') an.oneSidedPos.forEach((p) => add(kind, p.from, p.to));
    if (kind === 'mutualNegApart') an.mutualNeg.forEach((p) => add(kind, p.a, p.b));
    if (kind === 'conflictApart') an.conflicting.forEach((p) => add(kind, p.from, p.to));
    if (kind === 'oneSidedNegApart') an.oneSidedNeg.forEach((p) => add(kind, p.from, p.to));
  }
  return out;
}

export function suggestionNote(s: Pick<Suggestion, 'dimension' | 'kind'>): string {
  return `Sociogram ${DIMENSION_LABELS[s.dimension].toLowerCase()}: ${KIND_META[s.kind].label.toLowerCase()}`;
}
