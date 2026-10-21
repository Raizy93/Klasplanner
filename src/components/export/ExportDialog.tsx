import { LoaderCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useState } from 'react';
import { exportJson, exportPdf, exportPng } from '../../services/export/exportService';
import { activePlan, useAppStore } from '../../store/appStore';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Checkbox, Field, TextInput } from '../ui/primitives';

export type ExportFormat = 'png' | 'pdf' | 'json';

const TITLES: Record<ExportFormat, string> = {
  png: 'Exporteren als afbeelding (PNG)',
  pdf: 'Exporteren als PDF',
  json: 'Back-up maken (JSON)',
};

function RadioGroup<T extends string>({ name, value, onChange, options, legend }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-slate-700">{legend}</legend>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value === o.value ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={name} className="mt-1 accent-blue-600" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              <span className="font-medium text-slate-800">{o.label}</span>
              {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ExportDialog({ format, onClose }: { format: ExportFormat | null; onClose: () => void }) {
  const plan = useAppStore((s) => activePlan(s));
  const allPlans = useAppStore(useShallow((s) => s.planOrder.map((id) => s.plans[id])));
  const toast = useAppStore((s) => s.toast);
  const [names, setNames] = useState<'with' | 'without'>('with');
  const [paper, setPaper] = useState<'a4' | 'a3'>('a4');
  const [withTitle, setWithTitle] = useState(true);
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (format) setTitle(`Klassenplattegrond – ${plan.name}`);
  }, [format, plan.name]);

  if (!format) return null;

  const run = async () => {
    setBusy(true);
    try {
      const t = withTitle && title.trim() ? title.trim() : undefined;
      if (format === 'png') await exportPng(plan, names === 'with', t);
      else if (format === 'pdf') await exportPdf(plan, names === 'with', paper, t);
      else exportJson(scope === 'all' ? allPlans : [plan], scope === 'all' ? 'alle-plattegronden' : plan.name);
      toast('success', 'Het bestand is gedownload.');
      onClose();
    } catch (e) {
      toast('error', `Exporteren is mislukt: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={TITLES[format]}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={run} disabled={busy} icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : undefined}>
            {busy ? 'Bezig…' : 'Downloaden'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {format !== 'json' && (
          <>
            <RadioGroup
              name="names"
              legend="Privacy"
              value={names}
              onChange={setNames}
              options={[
                { value: 'with', label: 'Met leerlingnamen' },
                { value: 'without', label: 'Zonder leerlingnamen', hint: 'Toont zitplaatsnummers. Ook geschikt voor een lege plattegrond.' },
              ]}
            />
            {format === 'pdf' && (
              <RadioGroup
                name="paper"
                legend="Papierformaat"
                value={paper}
                onChange={setPaper}
                options={[
                  { value: 'a4', label: 'A4 liggend' },
                  { value: 'a3', label: 'A3 liggend' },
                ]}
              />
            )}
            <div className="space-y-2">
              <Checkbox checked={withTitle} onChange={setWithTitle} label="Titel bovenaan tonen" />
              {withTitle && (
                <Field label="Titel" htmlFor="export-title">
                  <TextInput id="export-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
                </Field>
              )}
            </div>
          </>
        )}
        {format === 'json' && (
          <>
            <RadioGroup
              name="scope"
              legend="Wat wil je bewaren?"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'current', label: `Alleen "${plan.name}"` },
                { value: 'all', label: `Alle plattegronden (${allPlans.length})`, hint: 'Handig als volledige back-up of om over te zetten naar een andere computer.' },
              ]}
            />
            <p className="text-xs text-slate-500">
              Het JSON-bestand bevat leerlingnamen, regels en indelingen. Je kunt het later importeren via het plattegrondenmenu. Bewaar het
              bestand zorgvuldig: het bevat persoonsgegevens.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
