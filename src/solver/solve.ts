import { optimize } from './optimize';
import { precheck } from './precheck';
import { prepare, satisfiesHard, softScore } from './prepare';
import { runSearch, type SearchOutcome } from './search';
import type { Conflict, Problem, SolveOptions, SolveResult } from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Zoekt een indeling in drie stappen:
 *  1. Aantoonbare conflicten opsporen (precheck).
 *  2. Een geldige indeling zoeken: eerst enkele korte, gerandomiseerde pogingen (restarts),
 *     daarna een volledige zoektocht tot de tijdslimiet.
 *  3. Voorkeuren en variatie optimaliseren met local search, zonder harde regels te schenden.
 */
export function solve(problem: Problem, opts: SolveOptions): SolveResult {
  const t0 = now();
  const deadline = t0 + opts.timeLimitMs;

  const pre = precheck(problem);
  if (pre.length > 0) return { status: 'infeasible', conflicts: pre, stats: { searchMs: now() - t0 } };

  const prep = prepare(problem);
  let outcome: SearchOutcome = { status: 'timeout', nodes: 0 };
  let nodes = 0;
  let restarts = 0;
  // Korte pogingen met verschillende willekeurige volgordes voorkomen dat één ongelukkige
  // vroege keuze de hele zoektocht vertraagt.
  for (let r = 0; r < 6; r++) {
    outcome = runSearch(prep, {
      seed: (opts.seed + r * 7919) >>> 0,
      deadline,
      nodeLimit: 1500 * 2 ** r,
      valueBias: problem.optimizePreferences,
    });
    nodes += outcome.nodes;
    restarts++;
    if (outcome.status === 'solved' || outcome.status === 'infeasible' || outcome.status === 'timeout') break;
  }
  if (outcome.status === 'nodeLimit') {
    outcome = runSearch(prep, { seed: opts.seed, deadline, valueBias: problem.optimizePreferences });
    nodes += outcome.nodes;
  }
  const searchMs = now() - t0;

  if (outcome.status === 'timeout' || outcome.status === 'nodeLimit') {
    return { status: 'timeout', stats: { nodes, restarts, searchMs } };
  }
  if (outcome.status === 'infeasible') {
    const conflicts = diagnose(problem, opts.diagnoseMs ?? 3000);
    return { status: 'infeasible', conflicts, stats: { nodes, restarts, searchMs } };
  }

  const t1 = now();
  let seatOf = optimize(prep, problem, outcome.seatOf, { seed: opts.seed ^ 0x5bd1e995, timeMs: opts.optimizeMs });
  let identical = isIdenticalToPrevious(problem, seatOf);
  if (identical) {
    // Nog één poging met sterkere variatie.
    seatOf = optimize(prep, problem, seatOf, {
      seed: (opts.seed * 31 + 7) >>> 0,
      timeMs: Math.max(150, opts.optimizeMs / 2),
      variationBoost: 6,
    });
    identical = isIdenticalToPrevious(problem, seatOf);
  }
  // Vangnet: lever nooit een indeling op die een harde beperking schendt.
  if (!satisfiesHard(prep, seatOf)) seatOf = outcome.seatOf;

  return {
    status: 'solved',
    seatOf: Array.from(seatOf),
    identicalToPrevious: identical,
    stats: {
      nodes,
      restarts,
      searchMs,
      optimizeMs: now() - t1,
      softScore: softScore(prep, seatOf),
      softMax: prep.softMax,
    },
  };
}

function isIdenticalToPrevious(problem: Problem, seatOf: ArrayLike<number>): boolean {
  return problem.previous.some((prev) => prev.length === seatOf.length && prev.every((s, i) => s === seatOf[i]));
}

/**
 * Zoekt (binnen het tijdsbudget) een zo klein mogelijke set harde beperkingen die samen onmogelijk is
 * (deletion filter). Een beperking wordt alleen weggelaten als bewezen is dat het probleem zonder
 * die beperking nog steeds onmogelijk is — de gerapporteerde set is dus altijd écht onmogelijk.
 */
export function diagnose(problem: Problem, budgetMs: number): Conflict[] {
  const end = now() + budgetMs;
  const hardIdx = problem.constraints.map((c, i) => (c.hard ? i : -1)).filter((i) => i >= 0);
  const active = problem.constraints.map((c) => c.hard);
  let conclusive = true;
  for (const ci of hardIdx) {
    if (now() > end) {
      conclusive = false;
      break;
    }
    active[ci] = false;
    const sub = runSearch(prepare(problem, active), {
      seed: 1,
      deadline: Math.min(end, now() + Math.max(100, budgetMs / 6)),
    });
    if (sub.status !== 'infeasible') {
      active[ci] = true;
      if (sub.status !== 'solved') conclusive = false;
    }
  }
  const remaining = hardIdx.filter((i) => active[i]).map((i) => problem.constraints[i]);
  if (remaining.length === 0) return [];
  return [
    {
      kind: 'conflictSet',
      minimal: conclusive,
      keys: remaining.map((c) => c.key),
      message: conclusive
        ? remaining.length === 1
          ? `Er is geen geldige indeling mogelijk door deze regel:`
          : `Er is geen geldige indeling mogelijk: deze ${remaining.length} regels kunnen niet allemaal tegelijk worden nageleefd. Pas één ervan aan of maak er een voorkeur van.`
        : `Er is geen geldige indeling mogelijk. De oorzaak zit in (een deel van) deze regels:`,
    },
  ];
}
