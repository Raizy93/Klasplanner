import { Lock, TriangleAlert } from 'lucide-react';
import type { Conflict } from '../../solver/types';
import { useAppStore } from '../../store/appStore';

/**
 * Toont conflicten met aanklikbare regels. Klik op een regel opent die regel om te bewerken;
 * klik op een vastgezette leerling selecteert die leerling.
 */
export function ConflictList({ conflicts, labels }: { conflicts: Conflict[]; labels: Record<string, string> }) {
  const openRuleDraft = useAppStore((s) => s.openRuleDraft);
  const setHighlight = useAppStore((s) => s.setHighlightRules);
  const selectStudent = useAppStore((s) => s.selectStudent);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <ul className="space-y-2">
      {conflicts.map((c, i) => (
        <li key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          <div className="flex gap-2">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
            <p>{c.message}</p>
          </div>
          {c.keys.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
              {c.keys.map((k) => {
                const isLock = k.startsWith('lock:');
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (isLock) {
                        setTab('students');
                        selectStudent(k.slice(5));
                      } else {
                        setHighlight(c.keys.filter((x) => !x.startsWith('lock:')));
                        openRuleDraft({ editId: k });
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-left text-xs font-medium text-red-800 hover:bg-red-100"
                    title={isLock ? 'Leerling bekijken' : 'Regel bewerken'}
                  >
                    {isLock && <Lock size={12} />}
                    {labels[k] ?? 'Onbekende regel'}
                  </button>
                );
              })}
            </div>
          )}
          {c.kind === 'conflictSet' && c.minimal === false && (
            <p className="mt-1 pl-6 text-xs text-red-800">Niet alle genoemde regels hoeven het probleem te veroorzaken; binnen de rekentijd kon dit niet verder worden verkleind.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
