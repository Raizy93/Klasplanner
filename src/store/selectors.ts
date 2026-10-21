import type { Plan, Room } from '../models/types';
import { buildSeatGraph, type SeatGraph } from '../services/room/seatGraph';
import { evaluateRules, type RuleEvaluation } from '../services/rules/evaluate';

/**
 * Gememoriseerde afgeleide gegevens. Dankzij immer verandert de referentie van `room`
 * alleen als het lokaal echt gewijzigd is, dus een WeakMap-cache is voldoende.
 */
const graphCache = new WeakMap<Room, SeatGraph>();

export function getSeatGraph(room: Room): SeatGraph {
  let g = graphCache.get(room);
  if (!g) {
    g = buildSeatGraph(room);
    graphCache.set(room, g);
  }
  return g;
}

const evalCache = new WeakMap<Plan, RuleEvaluation[]>();

export function getRuleEvaluations(plan: Plan): RuleEvaluation[] {
  let e = evalCache.get(plan);
  if (!e) {
    e = evaluateRules(plan, getSeatGraph(plan.room));
    evalCache.set(plan, e);
  }
  return e;
}
