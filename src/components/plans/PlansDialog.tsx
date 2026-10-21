import { Check, Copy, FilePlus2, FolderOpen, Pencil, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useRef, useState } from 'react';
import { parseImport } from '../../services/storage/storage';
import { useAppStore } from '../../store/appStore';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { Field, TextInput } from '../ui/primitives';

export function PlansDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plans = useAppStore(useShallow((s) => s.planOrder.map((id) => s.plans[id])));
  const activeId = useAppStore((s) => s.activePlanId);
  const { openPlan, renamePlan, duplicatePlanById, deletePlan, createPlan, importPlans, toast } = useAppStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast('error', 'Dit bestand is te groot om te importeren.');
      return;
    }
    const text = await file.text();
    const result = parseImport(text, plans.map((p) => p.name));
    if (!result.ok) {
      toast('error', `Importeren mislukt: ${result.error} Je bestaande gegevens zijn niet gewijzigd.`);
      return;
    }
    importPlans(result.plans);
    toast('success', `${result.plans.length} plattegrond${result.plans.length === 1 ? '' : 'en'} geïmporteerd.`);
    if (result.warnings.length) toast('warning', result.warnings[0]);
    onClose();
  };

  const toDelete = plans.find((p) => p.id === confirmDelete);

  return (
    <>
      <Dialog open={open} title="Plattegronden" onClose={onClose} width="max-w-2xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field label="Naam van de nieuwe klas" htmlFor="new-plan-name">
                <TextInput id="new-plan-name" placeholder="Bijv. Groep 8 – Oktober" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
              </Field>
            </div>
            <Button
              variant="primary"
              icon={<FilePlus2 size={16} />}
              onClick={() => {
                createPlan('empty', newName);
                setNewName('');
                toast('success', 'Nieuwe lege klas aangemaakt. Je andere plattegronden blijven bewaard.');
                onClose();
              }}
            >
              Nieuwe lege klas
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Sparkles size={15} />} onClick={() => { createPlan('demo'); onClose(); }}>
              Demoklas toevoegen
            </Button>
            <Button size="sm" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
              Importeren (JSON)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="JSON-bestand kiezen"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Opgeslagen plattegronden">
            {plans.map((p) => {
              const active = p.id === activeId;
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${active ? 'bg-blue-50/60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    {editing === p.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          renamePlan(p.id, editName);
                          setEditing(null);
                        }}
                      >
                        <TextInput aria-label="Nieuwe naam" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus maxLength={80} className="py-1" />
                        <IconButton label="Naam opslaan" size="sm" type="submit">
                          <Check size={16} />
                        </IconButton>
                        <IconButton label="Annuleren" size="sm" onClick={() => setEditing(null)}>
                          <X size={16} />
                        </IconButton>
                      </form>
                    ) : (
                      <>
                        <div className="truncate text-sm font-medium text-slate-900">
                          {p.name} {active && <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">geopend</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.students.length} leerlingen · {p.room.seats.length} zitplaatsen · {p.rules.length} regels · gewijzigd{' '}
                          {new Date(p.updatedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </>
                    )}
                  </div>
                  {editing !== p.id && (
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant={active ? 'subtle' : 'secondary'} disabled={active} icon={<FolderOpen size={15} />} onClick={() => { openPlan(p.id); onClose(); }}>
                        Openen
                      </Button>
                      <IconButton label={`${p.name} hernoemen`} size="sm" onClick={() => { setEditing(p.id); setEditName(p.name); }}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton label={`${p.name} dupliceren`} size="sm" onClick={() => duplicatePlanById(p.id)}>
                        <Copy size={15} />
                      </IconButton>
                      <IconButton label={`${p.name} verwijderen`} size="sm" onClick={() => setConfirmDelete(p.id)}>
                        <Trash2 size={15} className="text-red-600" />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">
            Alle gegevens worden alleen in deze browser bewaard. Maak regelmatig een back-up via <strong>Exporteren → Back-up (JSON)</strong>.
          </p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        title="Plattegrond verwijderen"
        message={
          <>
            Weet je zeker dat je <strong>{toDelete?.name}</strong> wilt verwijderen? Leerlingen, regels en indelingen van deze plattegrond gaan
            definitief verloren.
          </>
        }
        confirmLabel="Definitief verwijderen"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deletePlan(toDelete.id);
            toast('info', `"${toDelete.name}" is verwijderd.`);
          }
          setConfirmDelete(null);
        }}
      />
    </>
  );
}
