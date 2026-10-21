import { CircleCheck, Info, TriangleAlert, X, CircleX } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

const STYLES = {
  info: { cls: 'border-blue-200 bg-white', icon: <Info size={18} className="text-blue-600" /> },
  success: { cls: 'border-green-200 bg-white', icon: <CircleCheck size={18} className="text-green-600" /> },
  warning: { cls: 'border-amber-300 bg-amber-50', icon: <TriangleAlert size={18} className="text-amber-600" /> },
  error: { cls: 'border-red-300 bg-red-50', icon: <CircleX size={18} className="text-red-600" /> },
};

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm text-slate-800 shadow-md ${STYLES[t.kind].cls}`}>
          <span className="mt-0.5">{STYLES[t.kind].icon}</span>
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Melding sluiten" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-slate-500 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
