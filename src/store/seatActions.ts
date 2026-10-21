import type { ID, Plan } from '../models/types';
import { nameLookup } from '../services/generator/buildProblem';
import { assignStudent, toggleLock, unassignStudent } from '../services/plan/planOps';
import { describeRule } from '../services/rules/ruleMeta';
import { activePlan, useAppStore } from './appStore';
import { getRuleEvaluations } from './selectors';

/**
 * Handmatige wijzigingen aan de indeling. Na iedere wijziging wordt gecontroleerd of er
 * nieuwe overtredingen van harde regels zijn ontstaan; zo ja, dan krijgt de gebruiker een
 * waarschuwing. De wijziging wordt wel uitgevoerd: de leerkracht houdt de volledige controle.
 */

function violatedHardIds(plan: Plan): Set<ID> {
  return new Set(
    getRuleEvaluations(plan)
      .filter((e) => e.status === 'violated' && e.rule.priority === 'hard')
      .map((e) => e.rule.id),
  );
}

function warnNewViolations(before: Plan, after: Plan) {
  const old = violatedHardIds(before);
  const fresh = getRuleEvaluations(after).filter(
    (e) => e.status === 'violated' && e.rule.priority === 'hard' && !old.has(e.rule.id),
  );
  if (fresh.length === 0) return;
  const names = nameLookup(after);
  const first = describeRule(fresh[0].rule, names);
  const more = fresh.length > 1 ? ` (en nog ${fresh.length - 1} andere regel${fresh.length > 2 ? 's' : ''})` : '';
  useAppStore.getState().toast('warning', `Let op: ${first}${more}. De indeling bevat nu overtreden restricties.`);
}

function withCheck(recipe: (p: Plan) => void) {
  const store = useAppStore.getState();
  const before = activePlan(store);
  store.update((draft) => recipe(draft as Plan));
  const after = activePlan(useAppStore.getState());
  if (after !== before) warnNewViolations(before, after);
}

export function placeStudent(studentId: ID, seatId: ID) {
  const plan = activePlan(useAppStore.getState());
  const seat = plan.room.seats.find((s) => s.id === seatId);
  if (!seat) return;
  if (seat.disabled) {
    useAppStore.getState().toast('info', `Zitplaats ${seat.number} is gemarkeerd als niet beschikbaar.`);
    return;
  }
  const other = plan.arrangement.assignments[seatId];
  if (other && other !== studentId && plan.arrangement.locked.includes(other)) {
    const name = plan.students.find((s) => s.id === other)?.name ?? 'Deze leerling';
    useAppStore.getState().toast('info', `${name} is vastgezet op deze plek. Ontgrendel eerst om te wisselen.`);
    return;
  }
  withCheck((p) => {
    // Een vastgezette leerling die handmatig verplaatst wordt, blijft vastgezet op de nieuwe plek.
    assignStudent(p, studentId, seatId);
  });
  useAppStore.getState().selectStudent(studentId);
}

export function unplaceStudent(studentId: ID) {
  withCheck((p) => unassignStudent(p.arrangement, studentId));
}

export function toggleStudentLock(studentId: ID) {
  useAppStore.getState().update((p) => toggleLock(p as Plan, studentId));
}
