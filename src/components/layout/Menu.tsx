import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Eenvoudig, toetsenbordtoegankelijk uitklapmenu. */
export function Menu({
  trigger,
  items,
  align = 'right',
  label,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
        const idx = els.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
        els[next]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': menuId })}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute z-40 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none disabled:text-slate-300 ${
                it.danger ? 'text-red-700' : 'text-slate-800'
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
