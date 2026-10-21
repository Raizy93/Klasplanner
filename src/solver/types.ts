import type { RuleType } from '../models/types';
import type { ZoneFlags } from '../services/room/zones';

/**
 * Het generatieprobleem in een vlakke, serialiseerbare vorm (geschikt voor een Web Worker).
 * Leerlingen en zitplaatsen worden aangeduid met indices.
 */

export interface Constraint {
  /** Unieke sleutel: regel-ID of `lock:<leerling-ID>`. */
  key: string;
  source: 'rule' | 'lock';
  ruleId?: string;
  type: RuleType;
  /** Index van leerling A. */
  a: number;
  /** Index van leerling B (of -1). */
  b: number;
  /** Index van zitplaats (of -1). */
  seat: number;
  hard: boolean;
  weight: number;
  /** Leesbare omschrijving, bijv. "Emma moet vooraan zitten". */
  label: string;
}

export interface Problem {
  seatIds: string[];
  seatNumbers: number[];
  /** Groepsindex per zitplaats (losse tafels krijgen een eigen index). */
  groupOf: number[];
  beside: number[][];
  opposite: number[][];
  zones: ZoneFlags[];
  /** Mag de generator deze zitplaats gebruiken? */
  available: boolean[];
  studentIds: string[];
  studentNames: string[];
  constraints: Constraint[];
  /** Eerdere oplossingen (leerling-index → zitplaats-index, of -1). Recentste eerst. */
  previous: number[][];
  /** Weegfactoren voor variatie ten opzichte van eerdere oplossingen. */
  variation: { seatRepeat: number; pairRepeat: number };
  optimizePreferences: boolean;
}

export interface Conflict {
  kind:
    | 'capacity'
    | 'contradiction'
    | 'emptyDomain'
    | 'hall'
    | 'groupChain'
    | 'groupTooLarge'
    | 'degree'
    | 'seatTaken'
    | 'conflictSet';
  message: string;
  /** Betrokken beperkingen (constraint-sleutels; voor regels gelijk aan het regel-ID). */
  keys: string[];
  /** Bij `conflictSet`: is aangetoond dat iedere genoemde regel nodig is? */
  minimal?: boolean;
}

export interface SolveStats {
  nodes: number;
  restarts: number;
  searchMs: number;
  optimizeMs: number;
  softScore: number;
  softMax: number;
}

export type SolveResult =
  | { status: 'solved'; seatOf: number[]; stats: SolveStats; identicalToPrevious: boolean }
  | { status: 'infeasible'; conflicts: Conflict[]; stats: Partial<SolveStats> }
  | { status: 'timeout'; stats: Partial<SolveStats> };

export interface SolveOptions {
  seed: number;
  timeLimitMs: number;
  optimizeMs: number;
  /** Tijdsbudget voor het opsporen van de oorzaak bij een onmogelijke indeling. */
  diagnoseMs?: number;
}
