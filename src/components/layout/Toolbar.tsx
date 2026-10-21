import {
  ChevronDown,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  Image,
  LoaderCircle,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Save,
  Shuffle,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { activePlan, useAppStore } from '../../store/appStore';
import { saveNow } from '../../services/storage/persistence';
import { canvasApi } from '../canvas/canvasApi';
import { Button, IconButton } from '../ui/Button';
import { Menu } from './Menu';
import { ExportDialog, type ExportFormat } from '../export/ExportDialog';
import { PlansDialog } from '../plans/PlansDialog';

export function Toolbar() {
  const plan = useAppStore((s) => activePlan(s));
  const canUndo = useAppStore((s) => s.past.length > 0);
  const canRedo = useAppStore((s) => s.future.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const scale = useAppStore((s) => s.view.scale);
  const requestFit = useAppStore((s) => s.requestFit);
  const generate = useAppStore((s) => s.generate);
  const generating = useAppStore((s) => s.generating);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggle);
  const toast = useAppStore((s) => s.toast);
  const setTab = useAppStore((s) => s.setTab);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);

  const onSave = () => {
    if (saveNow()) toast('success', 'Wijzigingen opgeslagen in deze browser.');
    else toast('error', useAppStore.getState().saveError ?? 'Opslaan is mislukt.');
  };

  const onGenerate = () => {
    setTab('generate');
    void generate();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <IconButton label={sidebarOpen ? 'Paneel verbergen' : 'Paneel tonen'} onClick={() => toggleSidebar('sidebarOpen')}>
        {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
      </IconButton>
      <button
        type="button"
        onClick={() => setPlansOpen(true)}
        className="flex min-w-0 max-w-[16rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
        title="Plattegronden beheren"
      >
        <FolderOpen size={18} className="shrink-0 text-slate-500" />
        <span className="truncate text-sm font-semibold text-slate-900">{plan.name}</span>
        <ChevronDown size={15} className="shrink-0 text-slate-500" />
      </button>

      <div className="flex items-center rounded-lg border border-slate-200">
        <IconButton label="Ongedaan maken (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Opnieuw uitvoeren (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={18} />
        </IconButton>
      </div>

      <div className="flex items-center rounded-lg border border-slate-200">
        <IconButton label="Uitzoomen" onClick={() => canvasApi.zoomBy(1 / 1.2)}>
          <ZoomOut size={18} />
        </IconButton>
        <span className="w-12 text-center text-[13px] tabular-nums text-slate-700" aria-live="polite" aria-label="Zoompercentage">
          {Math.round(scale * 100)}%
        </span>
        <IconButton label="Inzoomen" onClick={() => canvasApi.zoomBy(1.2)}>
          <ZoomIn size={18} />
        </IconButton>
        <IconButton label="Passend maken" onClick={requestFit}>
          <Maximize2 size={17} />
        </IconButton>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button onClick={onGenerate} disabled={generating} icon={generating ? <LoaderCircle size={17} className="animate-spin" /> : <Shuffle size={17} />} title="Genereer een nieuwe indeling volgens de regels">
          <span className="hidden sm:inline">Nieuwe indeling</span>
        </Button>
        <Button onClick={onSave} icon={<Save size={17} />} title="Nu opslaan in deze browser">
          <span className="hidden sm:inline">Opslaan</span>
        </Button>
        <Menu
          label="Exporteren"
          items={[
            { label: 'Afbeelding (PNG)', icon: <Image size={16} />, onSelect: () => setExportFormat('png') },
            { label: 'Afdrukken (PDF)', icon: <FileText size={16} />, onSelect: () => setExportFormat('pdf') },
            { label: 'Back-up (JSON)', icon: <FileJson size={16} />, onSelect: () => setExportFormat('json') },
          ]}
          trigger={(props) => (
            <Button variant="primary" icon={<Download size={17} />} {...props}>
              <span className="hidden sm:inline">Exporteren</span>
              <ChevronDown size={15} />
            </Button>
          )}
        />
      </div>
      <ExportDialog format={exportFormat} onClose={() => setExportFormat(null)} />
      <PlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </div>
  );
}
