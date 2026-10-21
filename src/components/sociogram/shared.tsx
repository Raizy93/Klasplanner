import { EyeOff, ListPlus, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ID, Plan, RuleType, SocioDimension } from '../../models/types';
import { addRule } from '../../services/plan/planOps';
import { needsSecondStudent } from '../../services/rules/ruleMeta';
import { DIMENSION_LABELS } from '../../services/sociogram/sociogramOps';
import { STATUS_LABELS, type SocioStatus } from '../../services/sociogram/analysis';
import { activePlan, useAppStore } from '../../store/appStore';
import { Menu } from '../layout/Menu';
import { Button, IconButton } from '../ui/Button';

export function useStudentName() {
  const students = useAppStore((s) => activePlan(s).students);
  return (id: ID) => students.find((s) => s.id === id)?.name ?? '?';
}

export function Up({ size = 14 }: { size?: number }) {
  return <ThumbsUp size={size} className="text-green-700" aria-label="graag" />;
}
export function Down({ size = 14 }: { size?: number }) {
  return <ThumbsDown size={size} className="text-red-700" aria-label="liever niet" />;
}

const STATUS_TONE: Record<SocioStatus, string> = {
  popular: 'border-green-300 bg-green-50 text-green-900',
  controversial: 'border-amber-300 bg-amber-50 text-amber-900',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  neglected: 'border-slate-300 bg-slate-100 text-slate-800',
  average: 'border-slate-200 bg-white text-slate-600',
};

export function StatusBadge({ status }: { status: SocioStatus | null }) {
  if (!status) return <span className="text-xs text-slate-400">–</span>;
  return <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

/** Afscherming: het sociogram wordt pas getoond na een bewuste klik (bijv. als het digibord aanstaat). */
export function PrivacyGate({ compact = false }: { compact?: boolean }) {
  const setSocio = useAppStore((s) => s.setSocio);
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-center ${compact ? 'p-5' : 'p-10'}`}>
      <ShieldCheck size={compact ? 28 : 40} className="text-blue-600" aria-hidden />
      <div>
        <p className="font-semibold text-slate-900">Het sociogram is afgeschermd</p>
        <p className="mt-1 max-w-sm text-sm text-slate-600">
          Het sociogram bevat gevoelige informatie over leerlingen. Controleer of het niet zichtbaar is voor de klas (bijvoorbeeld op het digibord).
        </p>
      </div>
      <Button variant="primary" onClick={() => setSocio({ socioRevealed: true })}>
        Sociogram tonen
      </Button>
    </div>
  );
}

export function HideButton() {
  const setSocio = useAppStore((s) => s.setSocio);
  return (
    <IconButton label="Sociogram verbergen" size="sm" onClick={() => setSocio({ socioRevealed: false })}>
      <EyeOff size={16} />
    </IconButton>
  );
}

const QUICK_RULES: { type: RuleType; label: string }[] = [
  { type: 'sameGroup', label: 'Bij voorkeur samen in een groepje' },
  { type: 'notSameGroup', label: 'Bij voorkeur niet samen in een groepje' },
  { type: 'notBeside', label: 'Bij voorkeur niet naast elkaar' },
];

/** Menu om vanuit een paar in het overzicht met één klik een regel (voorkeur) te maken. */
export function PairRuleMenu({ a, b, dimension, reason }: { a: ID; b: ID; dimension: SocioDimension; reason: string }) {
  const update = useAppStore((s) => s.update);
  const toast = useAppStore((s) => s.toast);
  const name = useStudentName();
  const add = (type: RuleType) => {
    const plan = activePlan(useAppStore.getState());
    const exists = plan.rules.some(
      (r) => r.type === type && needsSecondStudent(r.type) && ((r.studentA === a && r.studentB === b) || (r.studentA === b && r.studentB === a)),
    );
    if (exists) {
      toast('info', 'Deze regel bestaat al.');
      return;
    }
    update((d) =>
      void addRule(d as Plan, {
        type,
        studentA: a,
        studentB: b,
        priority: 'soft',
        strength: 2,
        enabled: true,
        source: 'sociogram',
        note: `Sociogram ${DIMENSION_LABELS[dimension].toLowerCase()}: ${reason}`,
      }),
    );
    toast('success', `Regel toegevoegd voor ${name(a)} en ${name(b)}. Je vindt hem in het tabblad Regels.`);
  };
  return (
    <Menu
      label={`Regel maken voor ${name(a)} en ${name(b)}`}
      items={QUICK_RULES.map((q) => ({ label: q.label, onSelect: () => add(q.type) }))}
      trigger={(props) => (
        <IconButton size="sm" label={`Regel maken voor ${name(a)} en ${name(b)}`} {...props}>
          <ListPlus size={15} />
        </IconButton>
      )}
    />
  );
}

export function DimensionSwitch() {
  const dim = useAppStore((s) => s.socioDimension);
  const setSocio = useAppStore((s) => s.setSocio);
  return (
    <div role="radiogroup" aria-label="Vraag" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {(['work', 'play'] as SocioDimension[]).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={dim === d}
          onClick={() => setSocio({ socioDimension: d })}
          className={`rounded-md px-3 py-1 text-sm font-medium ${dim === d ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          {DIMENSION_LABELS[d]}
        </button>
      ))}
    </div>
  );
}
