import { solve } from '../../solver/solve';
import type { Problem, SolveOptions, SolveResult } from '../../solver/types';
import type { SolverResponse } from '../../workers/solver.worker';

/**
 * Voert de solver uit in een Web Worker, zodat de interface tijdens het rekenen niet vastloopt.
 * Is een worker niet beschikbaar (bijv. door een strenge iframe-sandbox), dan wordt
 * dezelfde code op de hoofdthread uitgevoerd.
 */
export function runSolver(problem: Problem, options: SolveOptions): { promise: Promise<SolveResult>; cancel: () => void } {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }

  if (!worker) {
    let cancelled = false;
    const promise = new Promise<SolveResult>((resolve, reject) => {
      setTimeout(() => {
        if (cancelled) return reject(new Error('geannuleerd'));
        try {
          resolve(solve(problem, options));
        } catch (e) {
          reject(e);
        }
      }, 30);
    });
    return { promise, cancel: () => (cancelled = true) };
  }

  const w = worker;
  let rejectFn: (e: Error) => void = () => {};
  const promise = new Promise<SolveResult>((resolve, reject) => {
    rejectFn = reject;
    w.onmessage = (e: MessageEvent<SolverResponse>) => {
      w.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    w.onerror = () => {
      w.terminate();
      // Terugvallen op de hoofdthread als de worker niet kan starten.
      try {
        resolve(solve(problem, options));
      } catch (err) {
        reject(err as Error);
      }
    };
    w.postMessage({ problem, options });
  });
  return {
    promise,
    cancel: () => {
      w.terminate();
      rejectFn(new Error('geannuleerd'));
    },
  };
}
