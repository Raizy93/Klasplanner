import { CircleCheck, CircleX, LoaderCircle, Scale, School, Sparkles, Users } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { useAppStore, type TabId } from '../../store/appStore';
import { StudentsTab } from '../students/StudentsTab';
import { RoomTab } from '../room/RoomTab';
import { RulesTab } from '../rules/RulesTab';
import { GenerateTab } from '../generator/GenerateTab';
import { Notice } from '../ui/primitives';

const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
  { id: 'students', label: 'Leerlingen', icon: Users },
  { id: 'room', label: 'Lokaal', icon: School },
  { id: 'rules', label: 'Regels', icon: Scale },
  { id: 'generate', label: 'Indelen', icon: Sparkles },
];

function SaveIndicator() {
  const status = useAppStore((s) => s.saveStatus);
  const error = useAppStore((s) => s.saveError);
  if (status === 'error')
    return (
      <span className="flex items-center gap-1 text-xs text-red-700" title={error ?? undefined}>
        <CircleX size={13} /> Opslaan mislukt
      </span>
    );
  if (status === 'pending')
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <LoaderCircle size={13} className="animate-spin" /> Opslaan…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <CircleCheck size={13} className="text-green-600" /> Wijzigingen opgeslagen
      </span>
    );
  return null;
}

export function Sidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setTab);
  const storageWarning = useAppStore((s) => s.storageWarning);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = TABS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      setTab(TABS[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-slate-50" aria-label="Bedieningspaneel">
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-blue-600 text-white" aria-hidden>
            <School size={16} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">Klassenplanner</span>
        </div>
        <SaveIndicator />
      </div>
      <div role="tablist" aria-label="Onderdelen" className="mx-3 mt-2 grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border-b-2 px-1 py-1.5 text-[13px] font-medium transition-colors ${
                active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={20} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>
      {storageWarning && (
        <div className="mx-3 mt-2">
          <Notice tone="amber">{storageWarning}</Notice>
        </div>
      )}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3"
      >
        {activeTab === 'students' && <StudentsTab />}
        {activeTab === 'room' && <RoomTab />}
        {activeTab === 'rules' && <RulesTab />}
        {activeTab === 'generate' && <GenerateTab />}
      </div>
    </aside>
  );
}
