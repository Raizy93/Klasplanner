import { useId, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react';

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} pr-8 ${props.className ?? ''}`} />;
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
        <input
          id={id}
          type="number"
          className="w-full min-w-0 rounded-lg bg-transparent px-2 py-1.5 text-sm focus:outline-none"
          value={Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {suffix && <span className="pr-2 text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
      />
      {label}
    </label>
  );
}

type BadgeTone = 'red' | 'amber' | 'green' | 'blue' | 'slate';
const TONES: Record<BadgeTone, string> = {
  red: 'bg-red-50 text-red-800 border-red-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  green: 'bg-green-50 text-green-800 border-green-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function Badge({ tone = 'slate', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({ tone, icon, children }: { tone: 'red' | 'amber' | 'green' | 'blue'; icon?: ReactNode; children: ReactNode }) {
  const cls = {
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-3 py-2 text-[13px] ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">{children}</p>;
}
