import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { createDemoPlan } from '../data/demo';
import { OPTIMIZE_TIME_MS, SOLVER_TIME_LIMIT_MS } from '../models/constants';
import type { Arrangement, ID, Plan, Rule } from '../models/types';
import { buildProblem, toAssignments, type SkippedRule } from '../services/generator/buildProblem';
import { runSolver } from '../services/generator/solverClient';
import { createEmptyPlan, duplicatePlan } from '../services/plan/planFactory';
import { evaluateRules, summarize, type EvaluationSummary } from '../services/rules/evaluate';
import { describeRule } from '../services/rules/ruleMeta';
import { nameLookup } from '../services/generator/buildProblem';
import type { Conflict, SolveStats } from '../solver/types';
import { createId } from '../utils/id';
import { randomSeed } from '../utils/random';
import { getSeatGraph } from './selectors';
import { sanitizeArrangement } from '../validation/planValidation';

export type TabId = 'students' | 'room' | 'rules' | 'generate';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface GenerationReport {
  status: 'solved' | 'infeasible' | 'timeout' | 'error';
  createdAt: number;
  placed?: number;
  summary?: EvaluationSummary;
  conflicts?: Conflict[];
  /** Leesbare omschrijving per beperking (voor aanklikbare regels in conflictmeldingen). */
  labels?: Record<string, string>;
  skipped?: SkippedRule[];
  reservedCount?: number;
  stats?: Partial<SolveStats>;
  identicalToPrevious?: boolean;
  error?: string;
}

export interface GeneratedOption {
  id: string;
  assignments: Record<ID, ID>;
  report: GenerationReport;
}

export interface ViewState {
  scale: number;
  x: number;
  y: number;
}

export interface RuleDraft {
  /** Bestaande regel bewerken, of nieuwe regel met vooraf ingevulde leerling. */
  editId?: ID;
  studentA?: ID;
  nonce: number;
}

interface HistoryEntry {
  plan: Plan;
  key?: string;
  at: number;
}

export interface AppState {
  plans: Record<ID, Plan>;
  planOrder: ID[];
  activePlanId: ID;

  past: HistoryEntry[];
  future: Plan[];

  activeTab: TabId;
  selection: ID[];
  selectedStudentId: ID | null;
  selectedSeatId: ID | null;
  view: ViewState;
  fitNonce: number;
  showGrid: boolean;
  snapToGrid: boolean;
  showZones: boolean;
  showSeatNumbers: boolean;
  sidebarOpen: boolean;
  ruleDraft: RuleDraft | null;
  highlightRuleIds: ID[];

  generating: boolean;
  cancelGeneration: (() => void) | null;
  generated: GeneratedOption[];
  generatedIndex: number;
  lastReport: GenerationReport | null;

  saveStatus: 'idle' | 'pending' | 'saved' | 'error';
  saveError: string | null;
  lastSavedAt: number | null;
  toasts: Toast[];
  storageWarning: string | null;

  // ---- acties ----
  update: (recipe: (draft: Draft<Plan>) => void, opts?: { coalesceKey?: string; skipHistory?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  setTab: (tab: TabId) => void;
  setSelection: (ids: ID[]) => void;
  selectStudent: (id: ID | null) => void;
  selectSeat: (id: ID | null) => void;
  setView: (v: Partial<ViewState>) => void;
  requestFit: () => void;
  toggle: (key: 'showGrid' | 'snapToGrid' | 'showZones' | 'showSeatNumbers' | 'sidebarOpen') => void;
  setSidebarOpen: (open: boolean) => void;
  openRuleDraft: (draft: Omit<RuleDraft, 'nonce'>) => void;
  clearRuleDraft: () => void;
  setHighlightRules: (ids: ID[]) => void;
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;

  generate: () => Promise<void>;
  cancel: () => void;
  showGenerated: (index: number) => void;

  createPlan: (kind: 'empty' | 'demo', name?: string) => void;
  openPlan: (id: ID) => void;
  renamePlan: (id: ID, name: string) => void;
  duplicatePlanById: (id: ID) => void;
  deletePlan: (id: ID) => void;
  importPlans: (plans: Plan[]) => void;
  hydrate: (plans: Plan[], activeId: ID | null) => void;
  setSaveStatus: (s: AppState['saveStatus'], error?: string | null) => void;
  setStorageWarning: (w: string | null) => void;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

export const activePlan = (s: Pick<AppState, 'plans' | 'activePlanId'>): Plan => s.plans[s.activePlanId];

/** Startwaarde; wordt bij het opstarten vervangen door opgeslagen gegevens of de demoklas. */
function initialState() {
  const plan = createEmptyPlan('Nieuwe klas');
  return { plans: { [plan.id]: plan }, planOrder: [plan.id], activePlanId: plan.id };
}

function resetPlanUi() {
  return {
    past: [] as HistoryEntry[],
    future: [] as Plan[],
    selection: [] as ID[],
    selectedStudentId: null,
    selectedSeatId: null,
    generated: [] as GeneratedOption[],
    generatedIndex: -1,
    lastReport: null,
    ruleDraft: null,
    highlightRuleIds: [] as ID[],
  };
}

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialState(),
  ...resetPlanUi(),
  activeTab: 'students',
  view: { scale: 0.8, x: 20, y: 20 },
  fitNonce: 0,
  showGrid: true,
  snapToGrid: true,
  showZones: false,
  showSeatNumbers: false,
  sidebarOpen: true,
  generating: false,
  cancelGeneration: null,
  saveStatus: 'idle',
  saveError: null,
  lastSavedAt: null,
  toasts: [],
  storageWarning: null,

  update: (recipe, opts = {}) => {
    const state = get();
    const current = activePlan(state);
    const changed = produce(current, recipe);
    if (changed === current) return;
    const next = produce(changed, (draft) => {
      const clean = sanitizeArrangement(draft.arrangement as Arrangement, draft as Plan);
      const a = draft.arrangement;
      if (
        Object.keys(clean.assignments).length !== Object.keys(a.assignments).length ||
        clean.locked.length !== a.locked.length
      ) {
        draft.arrangement = clean as Draft<Arrangement>;
      }
      draft.updatedAt = Date.now();
    });
    let past = state.past;
    if (!opts.skipHistory) {
      const last = past[past.length - 1];
      const now = Date.now();
      const coalesce = opts.coalesceKey && last && last.key === opts.coalesceKey && now - last.at < COALESCE_MS;
      if (coalesce) past = [...past.slice(0, -1), { ...last, at: now }];
      else past = [...past, { plan: current, key: opts.coalesceKey, at: now }].slice(-HISTORY_LIMIT);
    }
    // Selecties opschonen als objecten verdwenen zijn.
    const ids = new Set([...next.room.desks.map((d) => d.id), ...next.room.objects.map((o) => o.id)]);
    const selection = state.selection.filter((id) => ids.has(id));
    set({
      plans: { ...state.plans, [next.id]: next },
      past,
      future: opts.skipHistory ? state.future : [],
      selection: selection.length === state.selection.length ? state.selection : selection,
      selectedStudentId: next.students.some((s) => s.id === state.selectedStudentId) ? state.selectedStudentId : null,
      selectedSeatId: next.room.seats.some((s) => s.id === state.selectedSeatId) ? state.selectedSeatId : null,
    });
  },

  undo: () => {
    const s = get();
    const entry = s.past[s.past.length - 1];
    if (!entry) return;
    const current = activePlan(s);
    set({
      plans: { ...s.plans, [current.id]: { ...entry.plan, updatedAt: Date.now() } },
      past: s.past.slice(0, -1),
      future: [current, ...s.future].slice(0, HISTORY_LIMIT),
    });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const current = activePlan(s);
    set({
      plans: { ...s.plans, [current.id]: { ...next, updatedAt: Date.now() } },
      past: [...s.past, { plan: current, at: 0 }],
      future: s.future.slice(1),
    });
  },

  setTab: (tab) => set({ activeTab: tab, selection: tab === 'room' ? get().selection : [] }),
  setSelection: (ids) => set({ selection: ids }),
  selectStudent: (id) => set({ selectedStudentId: id, selectedSeatId: null }),
  selectSeat: (id) => set({ selectedSeatId: id }),
  setView: (v) => set({ view: { ...get().view, ...v } }),
  requestFit: () => set({ fitNonce: get().fitNonce + 1 }),
  toggle: (key) => set({ [key]: !get()[key] } as Partial<AppState>),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openRuleDraft: (draft) => set({ ruleDraft: { ...draft, nonce: Date.now() }, activeTab: 'rules' }),
  clearRuleDraft: () => set({ ruleDraft: null }),
  setHighlightRules: (ids) => set({ highlightRuleIds: ids }),

  toast: (kind, message) => {
    const id = createId('toast');
    set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' || kind === 'warning' ? 7000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  generate: async () => {
    const s = get();
    if (s.generating) return;
    const plan = activePlan(s);
    const graph = getSeatGraph(plan.room);
    const history = [
      ...s.generated.map((g) => g.assignments).reverse(),
      plan.arrangement.assignments,
    ];
    const built = buildProblem(plan, graph, { history });
    const labels: Record<string, string> = {};
    built.problem.constraints.forEach((c) => (labels[c.key] = c.label));
    const { promise, cancel } = runSolver(built.problem, {
      seed: randomSeed(),
      timeLimitMs: SOLVER_TIME_LIMIT_MS,
      optimizeMs: OPTIMIZE_TIME_MS,
      diagnoseMs: 3000,
    });
    set({ generating: true, cancelGeneration: cancel });
    const planId = plan.id;
    try {
      const result = await promise;
      if (get().activePlanId !== planId) return;
      const createdAt = Date.now();
      if (result.status !== 'solved') {
        set({
          lastReport: {
            status: result.status,
            createdAt,
            conflicts: result.status === 'infeasible' ? result.conflicts : undefined,
            labels,
            skipped: built.skipped,
            stats: result.stats,
          },
        });
        return;
      }
      const assignments = toAssignments(built.problem, result.seatOf, built.reserved);
      // Controleer de uitkomst onafhankelijk van de solver: een indeling die een harde regel schendt
      // wordt nooit automatisch getoond.
      const current = activePlan(get());
      const check = summarize(evaluateRules(current, graph, { assignments, locked: current.arrangement.locked }));
      if (check.hardViolated.length > 0) {
        set({ lastReport: { status: 'error', createdAt, error: 'De gevonden indeling voldeed niet aan alle harde regels en is daarom niet toegepast.' } });
        return;
      }
      const report: GenerationReport = {
        status: 'solved',
        createdAt,
        placed: result.seatOf.filter((x) => x >= 0).length,
        summary: check,
        skipped: built.skipped,
        reservedCount: built.reserved.length,
        stats: result.stats,
        identicalToPrevious: result.identicalToPrevious,
      };
      get().update((draft) => {
        draft.arrangement.assignments = assignments;
      });
      const option: GeneratedOption = { id: createId('gen'), assignments, report };
      const generated = [...get().generated.slice(0, get().generatedIndex + 1), option].slice(-20);
      set({ generated, generatedIndex: generated.length - 1, lastReport: report });
    } catch (e) {
      if ((e as Error).message !== 'geannuleerd') {
        set({ lastReport: { status: 'error', createdAt: Date.now(), error: String((e as Error).message ?? e) } });
      }
    } finally {
      set({ generating: false, cancelGeneration: null });
    }
  },

  cancel: () => {
    get().cancelGeneration?.();
    set({ generating: false, cancelGeneration: null });
  },

  showGenerated: (index) => {
    const opt = get().generated[index];
    if (!opt) return;
    get().update((draft) => {
      draft.arrangement.assignments = { ...opt.assignments };
    });
    set({ generatedIndex: index, lastReport: opt.report });
  },

  createPlan: (kind, name) => {
    const s = get();
    const names = s.planOrder.map((id) => s.plans[id].name);
    const plan = kind === 'demo' ? createDemoPlan(true) : createEmptyPlan(uniqueName(name?.trim() || 'Nieuwe klas', names));
    if (kind === 'demo') plan.name = uniqueName(plan.name, names);
    set({
      plans: { ...s.plans, [plan.id]: plan },
      planOrder: [...s.planOrder, plan.id],
      activePlanId: plan.id,
      ...resetPlanUi(),
      activeTab: kind === 'empty' ? 'students' : s.activeTab,
      fitNonce: s.fitNonce + 1,
    });
  },

  openPlan: (id) => {
    const s = get();
    if (!s.plans[id] || id === s.activePlanId) return;
    s.cancelGeneration?.();
    set({ activePlanId: id, ...resetPlanUi(), generating: false, fitNonce: s.fitNonce + 1 });
  },

  renamePlan: (id, name) => {
    const s = get();
    const plan = s.plans[id];
    if (!plan || !name.trim()) return;
    set({ plans: { ...s.plans, [id]: { ...plan, name: name.trim().slice(0, 80), updatedAt: Date.now() } } });
  },

  duplicatePlanById: (id) => {
    const s = get();
    const plan = s.plans[id];
    if (!plan) return;
    const names = s.planOrder.map((x) => s.plans[x].name);
    const copy = duplicatePlan(plan, uniqueName(`${plan.name} (kopie)`, names));
    const order = [...s.planOrder];
    order.splice(order.indexOf(id) + 1, 0, copy.id);
    set({ plans: { ...s.plans, [copy.id]: copy }, planOrder: order });
  },

  deletePlan: (id) => {
    const s = get();
    if (!s.plans[id]) return;
    const plans = { ...s.plans };
    delete plans[id];
    let order = s.planOrder.filter((x) => x !== id);
    let active = s.activePlanId;
    if (order.length === 0) {
      const fresh = createEmptyPlan('Nieuwe klas');
      plans[fresh.id] = fresh;
      order = [fresh.id];
    }
    const switching = active === id;
    if (switching) active = order[0];
    set({ plans, planOrder: order, activePlanId: active, ...(switching ? { ...resetPlanUi(), fitNonce: s.fitNonce + 1 } : {}) });
  },

  importPlans: (imported) => {
    const s = get();
    if (imported.length === 0) return;
    const plans = { ...s.plans };
    imported.forEach((p) => (plans[p.id] = p));
    set({
      plans,
      planOrder: [...s.planOrder, ...imported.map((p) => p.id)],
      activePlanId: imported[0].id,
      ...resetPlanUi(),
      fitNonce: s.fitNonce + 1,
    });
  },

  hydrate: (plans, activeId) => {
    if (plans.length === 0) return;
    const map: Record<ID, Plan> = {};
    plans.forEach((p) => (map[p.id] = p));
    set({
      plans: map,
      planOrder: plans.map((p) => p.id),
      activePlanId: activeId && map[activeId] ? activeId : plans[0].id,
      ...resetPlanUi(),
      fitNonce: get().fitNonce + 1,
    });
  },

  setSaveStatus: (saveStatus, error = null) =>
    set({ saveStatus, saveError: error, lastSavedAt: saveStatus === 'saved' ? Date.now() : get().lastSavedAt }),
  setStorageWarning: (w) => set({ storageWarning: w }),
}));

/** Hulpfunctie: beschrijving van een regel in de actieve plattegrond. */
export function describeRuleInPlan(plan: Plan, rule: Rule): string {
  return describeRule(rule, nameLookup(plan));
}
