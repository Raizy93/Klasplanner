import type { Priority, Rule, RuleType, Strength } from '../../models/types';

export type RuleCategory = 'zone' | 'pair' | 'seat';

export interface RuleMeta {
  category: RuleCategory;
  /** Label in het keuzemenu. */
  label: string;
  /** Zin bij harde restrictie: `{A}`, `{B}`, `{S}` worden ingevuld. */
  hard: string;
  /** Zin bij voorkeur. */
  soft: string;
  /** Tegenhanger (voor conflictdetectie). */
  opposite?: RuleType;
}

export const RULE_META: Record<RuleType, RuleMeta> = {
  front: { category: 'zone', label: 'Vooraan zitten', hard: '{A} moet vooraan zitten', soft: '{A} zit bij voorkeur vooraan' },
  back: { category: 'zone', label: 'Achteraan zitten', hard: '{A} moet achteraan zitten', soft: '{A} zit bij voorkeur achteraan' },
  left: { category: 'zone', label: 'Links zitten', hard: '{A} moet links zitten', soft: '{A} zit bij voorkeur links' },
  right: { category: 'zone', label: 'Rechts zitten', hard: '{A} moet rechts zitten', soft: '{A} zit bij voorkeur rechts' },
  middle: { category: 'zone', label: 'In het midden zitten', hard: '{A} moet in het midden zitten', soft: '{A} zit bij voorkeur in het midden' },
  beside: { category: 'pair', label: 'Naast … zitten', hard: '{A} moet naast {B} zitten', soft: '{A} zit bij voorkeur naast {B}', opposite: 'notBeside' },
  notBeside: { category: 'pair', label: 'Niet naast … zitten', hard: '{A} mag niet naast {B} zitten', soft: '{A} zit liever niet naast {B}', opposite: 'beside' },
  sameGroup: { category: 'pair', label: 'In hetzelfde groepje als …', hard: '{A} moet in hetzelfde groepje zitten als {B}', soft: '{A} zit bij voorkeur in hetzelfde groepje als {B}', opposite: 'notSameGroup' },
  notSameGroup: { category: 'pair', label: 'Niet in hetzelfde groepje als …', hard: '{A} mag niet in hetzelfde groepje zitten als {B}', soft: '{A} zit liever niet in hetzelfde groepje als {B}', opposite: 'sameGroup' },
  opposite: { category: 'pair', label: 'Tegenover … zitten', hard: '{A} moet direct tegenover {B} zitten', soft: '{A} zit bij voorkeur tegenover {B}', opposite: 'notOpposite' },
  notOpposite: { category: 'pair', label: 'Niet tegenover … zitten', hard: '{A} mag niet direct tegenover {B} zitten', soft: '{A} zit liever niet tegenover {B}', opposite: 'opposite' },
  atSeat: { category: 'seat', label: 'Op een specifieke zitplaats', hard: '{A} moet op zitplaats {S} zitten', soft: '{A} zit bij voorkeur op zitplaats {S}', opposite: 'notAtSeat' },
  notAtSeat: { category: 'seat', label: 'Niet op een specifieke zitplaats', hard: '{A} mag niet op zitplaats {S} zitten', soft: '{A} zit liever niet op zitplaats {S}', opposite: 'atSeat' },
};

export const RULE_TYPE_GROUPS: { label: string; types: RuleType[] }[] = [
  { label: 'Positie in het lokaal', types: ['front', 'back', 'left', 'right', 'middle'] },
  { label: 'Samen met een andere leerling', types: ['beside', 'notBeside', 'sameGroup', 'notSameGroup', 'opposite', 'notOpposite'] },
  { label: 'Zitplaats', types: ['atSeat', 'notAtSeat'] },
];

export const needsSecondStudent = (t: RuleType) => RULE_META[t].category === 'pair';
export const needsSeat = (t: RuleType) => RULE_META[t].category === 'seat';
export const isZoneRule = (t: RuleType) => RULE_META[t].category === 'zone';

export const STRENGTH_LABELS: Record<Strength, string> = { 1: 'Lage voorkeur', 2: 'Normale voorkeur', 3: 'Sterke voorkeur' };
/** Gewichten in de optimalisatie. */
export const STRENGTH_WEIGHTS: Record<Strength, number> = { 1: 1, 2: 3, 3: 9 };

export const PRIORITY_LABELS: Record<Priority, string> = { hard: 'Harde restrictie', soft: 'Voorkeur' };

export interface NameLookup {
  student: (id: string | undefined) => string;
  seat: (id: string | undefined) => string;
}

export function describeRule(rule: Rule, names: NameLookup): string {
  const meta = RULE_META[rule.type];
  const tpl = rule.priority === 'hard' ? meta.hard : meta.soft;
  return tpl
    .replace('{A}', names.student(rule.studentA))
    .replace('{B}', names.student(rule.studentB))
    .replace('{S}', names.seat(rule.seatId));
}
