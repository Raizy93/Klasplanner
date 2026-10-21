/// <reference lib="webworker" />
import { solve } from '../solver/solve';
import type { Problem, SolveOptions, SolveResult } from '../solver/types';

export interface SolverRequest {
  problem: Problem;
  options: SolveOptions;
}

export type SolverResponse = { ok: true; result: SolveResult } | { ok: false; error: string };

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  try {
    const result = solve(e.data.problem, e.data.options);
    (self as unknown as Worker).postMessage({ ok: true, result } satisfies SolverResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) } satisfies SolverResponse);
  }
};
