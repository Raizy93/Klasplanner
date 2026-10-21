import { Pencil, X } from 'lucide-react';
import type { Rule } from '../../models/types';
import { STRENGTH_LABELS } from '../../services/rules/ruleMeta';
import type { RuleStatus } from '../../services/rules/evaluate';
import { Badge } from '../ui/primitives';

export function PriorityBadge({ rule }: { rule: Rule }) {
  return rule.priority === 'hard' ? (
    <Badge tone="red" title="Harde restrictie: wordt nooit overtreden door de generator">
      Hard
    </Badge>
  ) : (
    <Badge tone="amber" title={STRENGTH_LABELS[rule.strength]}>
      Voorkeur{rule.strength === 3 ? ' · sterk' : rule.strength === 1 ? ' · laag' : ''}
    </Badge>
  );
}

export function StatusText({ status, reason }: { status: RuleStatus; reason?: string }) {
  if (status === 'satisfied') return <span className="text-xs font-medium text-green-700">✓ voldaan</span>;
  if (status === 'violated') return <span className="text-xs font-semibold text-red-700">✗ niet voldaan</span>;
  const label =
    reason === 'disabled' ? 'uitgeschakeld' : reason === 'absent' ? 'leerling afwezig' : reason === 'invalid' ? 'ongeldig' : 'nog niet geplaatst';
  return <span className="text-xs text-slate-500">– {label}</span>;
}

/** Compacte regelkaart voor bij een leerling (zoals "Moet vooraan zitten"). */
export function RuleCard({ rule, text, onEdit, onRemove }: { rule: Rule; text: string; onEdit: () => void; onRemove: () => void }) {
  const hard = rule.priority === 'hard';
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        !rule.enabled ? 'border-slate-200 bg-slate-50 text-slate-500' : hard ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className={!rule.enabled ? 'line-through' : ''}>{text}</div>
        <div className="mt-0.5">
          <PriorityBadge rule={rule} />
          {!rule.enabled && <span className="ml-1 text-xs">(uitgeschakeld)</span>}
        </div>
      </div>
      <button type="button" aria-label={`Regel bewerken: ${text}`} title="Bewerken" onClick={onEdit} className="rounded p-1 hover:bg-white/70">
        <Pencil size={14} />
      </button>
      <button type="button" aria-label={`Regel verwijderen: ${text}`} title="Verwijderen" onClick={onRemove} className="rounded p-1 hover:bg-white/70">
        <X size={15} />
      </button>
    </div>
  );
}
