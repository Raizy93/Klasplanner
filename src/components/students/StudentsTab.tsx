import { Check, EllipsisVertical, Eye, EyeOff, GripVertical, Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PALETTE } from '../../models/constants';
import type { Plan, Student } from '../../models/types';
import { nameLookup } from '../../services/generator/buildProblem';
import {
  addStudent,
  parseNameList,
  removeRule,
  removeStudent,
  renameStudent,
  rulesForStudent,
  seatOfStudent,
  setStudentAbsent,
} from '../../services/plan/planOps';
import { describeRule } from '../../services/rules/ruleMeta';
import { activePlan, useAppStore } from '../../store/appStore';
import { placeStudent, toggleStudentLock, unplaceStudent } from '../../store/seatActions';
import { Menu } from '../layout/Menu';
import { RuleCard } from '../rules/RuleChip';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { Card, Checkbox, EmptyState, Notice, Select, TextInput } from '../ui/primitives';
import { STUDENT_DRAG_TYPE } from '../canvas/canvasApi';

function AddStudentForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const update = useAppStore((s) => s.update);
  const toast = useAppStore((s) => s.toast);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const exists = activePlan(useAppStore.getState()).students.some((s) => s.name.toLocaleLowerCase('nl') === n.toLocaleLowerCase('nl'));
    update((d) => void addStudent(d as Plan, n));
    if (exists) toast('info', `Er is nu meer dan één leerling met de naam "${n}". Overweeg een achternaamletter toe te voegen.`);
    setName('');
  };
  return (
    <form onSubmit={submit} className="mt-2 flex gap-1.5" aria-label="Leerling toevoegen">
      <TextInput aria-label="Naam van de leerling" placeholder="Naam van de leerling" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Toevoegen
      </Button>
      <IconButton label="Formulier sluiten" onClick={onDone}>
        <X size={18} />
      </IconButton>
    </form>
  );
}

function StudentRow({ student, plan, selected, locked, placed }: { student: Student; plan: Plan; selected: boolean; locked: boolean; placed: boolean }) {
  const selectStudent = useAppStore((s) => s.selectStudent);
  const update = useAppStore((s) => s.update);
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(student.name);
  const ruleCount = rulesForStudent(plan, student.id).length;
  const palette = PALETTE[student.color % PALETTE.length];

  return (
    <li
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(STUDENT_DRAG_TYPE, student.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 last:border-b-0 ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
    >
      <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" aria-hidden />
      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: palette.dot }} aria-hidden />
      {renaming ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            update((d) => renameStudent(d as Plan, student.id, name));
            setRenaming(false);
          }}
        >
          <TextInput aria-label="Nieuwe naam" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="py-1" maxLength={60} />
          <IconButton label="Opslaan" size="sm" type="submit">
            <Check size={16} />
          </IconButton>
          <IconButton label="Annuleren" size="sm" onClick={() => setRenaming(false)}>
            <X size={16} />
          </IconButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => selectStudent(selected ? null : student.id)}
          aria-pressed={selected}
          className={`min-w-0 flex-1 truncate text-left text-sm ${student.absent ? 'italic text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}
        >
          {student.name}
          {!placed && !student.absent && <span className="ml-1.5 text-xs not-italic text-slate-400">(niet geplaatst)</span>}
        </button>
      )}
      {locked && <Lock size={14} className="shrink-0 text-slate-500" aria-label="Vastgezet" />}
      {!renaming && (
        <>
          <IconButton
            size="sm"
            label={student.absent ? `${student.name} is afwezig – markeren als aanwezig` : `${student.name} markeren als afwezig`}
            active={student.absent}
            onClick={() => update((d) => setStudentAbsent(d as Plan, student.id, !student.absent))}
          >
            {student.absent ? <EyeOff size={15} /> : <Eye size={15} className="opacity-40 group-hover:opacity-100" />}
          </IconButton>
          <Menu
            label={`Acties voor ${student.name}`}
            items={[
              { label: 'Naam wijzigen', icon: <Pencil size={15} />, onSelect: () => { setName(student.name); setRenaming(true); } },
              { label: 'Verwijderen', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirm(true) },
            ]}
            trigger={(props) => (
              <IconButton size="sm" label={`Meer acties voor ${student.name}`} {...props}>
                <EllipsisVertical size={16} />
              </IconButton>
            )}
          />
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title="Leerling verwijderen"
        message={
          <>
            Weet je zeker dat je <strong>{student.name}</strong> wilt verwijderen?
            {ruleCount > 0 && ` ${ruleCount} regel${ruleCount === 1 ? '' : 's'} met deze leerling ${ruleCount === 1 ? 'wordt' : 'worden'} ook verwijderd.`}
            {' '}Dit kun je ongedaan maken met Ctrl+Z.
          </>
        }
        confirmLabel="Verwijderen"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          update((d) => removeStudent(d as Plan, student.id));
          setConfirm(false);
        }}
      />
    </li>
  );
}

function SelectedStudent({ plan, student }: { plan: Plan; student: Student }) {
  const update = useAppStore((s) => s.update);
  const openRuleDraft = useAppStore((s) => s.openRuleDraft);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(student.name);
  const seatId = seatOfStudent(plan.arrangement, student.id);
  const seat = plan.room.seats.find((s) => s.id === seatId);
  const desk = seat ? plan.room.desks.find((d) => d.id === seat.deskId) : undefined;
  const group = desk?.groupId ? plan.room.groups.find((g) => g.id === desk.groupId) : undefined;
  const locked = plan.arrangement.locked.includes(student.id);
  const rules = rulesForStudent(plan, student.id);
  const names = nameLookup(plan);
  const seats = [...plan.room.seats].sort((a, b) => a.number - b.number);

  return (
    <Card title="Geselecteerde leerling">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: PALETTE[student.color % PALETTE.length].dot }} aria-hidden />
          {renaming ? (
            <form
              className="flex flex-1 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                update((d) => renameStudent(d as Plan, student.id, name));
                setRenaming(false);
              }}
            >
              <TextInput aria-label="Naam" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="py-1" maxLength={60} />
              <IconButton label="Opslaan" size="sm" type="submit">
                <Check size={16} />
              </IconButton>
            </form>
          ) : (
            <>
              <span className="truncate text-lg font-semibold text-slate-900">{student.name}</span>
              <IconButton
                label="Naam wijzigen"
                size="sm"
                onClick={() => {
                  setName(student.name);
                  setRenaming(true);
                }}
              >
                <Pencil size={15} />
              </IconButton>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kleur">
          {PALETTE.map((p, i) => (
            <button
              key={p.name}
              type="button"
              role="radio"
              aria-checked={student.color === i}
              aria-label={`Kleur ${p.name}`}
              title={p.name}
              onClick={() => update((d) => void (d.students.find((s) => s.id === student.id)!.color = i))}
              className={`h-6 w-6 rounded-full border-2 ${student.color === i ? 'border-slate-800' : 'border-white'}`}
              style={{ background: p.fill, boxShadow: `inset 0 0 0 1px ${p.stroke}` }}
            />
          ))}
        </div>
        <Checkbox checked={student.absent} onChange={(v) => update((d) => setStudentAbsent(d as Plan, student.id, v))} label="Vandaag afwezig" />
        {student.absent && seat && (
          <p className="text-xs text-slate-500">
            De huidige plek blijft bewaard. Bij een nieuwe indeling telt {student.name} niet mee
            {locked ? ', maar de vastgezette plek blijft gereserveerd' : ''}.
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Zitplaats</dt>
          <dd className="text-slate-800">{seat ? `Zitplaats ${seat.number}` : 'Niet geplaatst'}</dd>
          <dt className="text-slate-500">Groepje</dt>
          <dd className="text-slate-800">{group ? group.name : seat ? 'Losse tafel' : '–'}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            aria-label="Zitplaats kiezen"
            className="w-auto flex-1 py-1.5"
            value={seat?.id ?? ''}
            onChange={(e) => (e.target.value ? placeStudent(student.id, e.target.value) : unplaceStudent(student.id))}
          >
            <option value="">Niet geplaatst</option>
            {seats.map((s) => {
              const occ = plan.students.find((x) => x.id === plan.arrangement.assignments[s.id]);
              return (
                <option key={s.id} value={s.id} disabled={s.disabled}>
                  Zitplaats {s.number}
                  {s.disabled ? ' (niet beschikbaar)' : occ && occ.id !== student.id ? ` – ${occ.name}` : ''}
                </option>
              );
            })}
          </Select>
          <Button size="sm" disabled={!seat} onClick={() => toggleStudentLock(student.id)} icon={<Lock size={14} />}>
            {locked ? 'Ontgrendelen' : 'Vastzetten'}
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Regels voor {student.name}</h4>
        <div className="space-y-1.5">
          {rules.length === 0 && <p className="text-sm text-slate-500">Nog geen regels.</p>}
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              text={describeRule(r, names)}
              onEdit={() => openRuleDraft({ editId: r.id })}
              onRemove={() => update((d) => removeRule(d as Plan, r.id))}
            />
          ))}
        </div>
        <Button variant="primary" block className="mt-2" icon={<Plus size={16} />} onClick={() => openRuleDraft({ studentA: student.id })}>
          Regel toevoegen
        </Button>
      </div>
    </Card>
  );
}

function BulkAdd() {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<ReturnType<typeof parseNameList> | null>(null);
  const update = useAppStore((s) => s.update);
  const toast = useAppStore((s) => s.toast);

  const commit = (names: string[], skipped: number) => {
    if (names.length === 0) {
      toast('info', 'Er zijn geen nieuwe namen toegevoegd.');
    } else {
      update((d) => names.forEach((n) => addStudent(d as Plan, n)));
      toast('success', `${names.length} leerling${names.length === 1 ? '' : 'en'} toegevoegd.${skipped ? ` ${skipped} overgeslagen.` : ''}`);
    }
    setText('');
    setPending(null);
  };

  const submit = () => {
    const existing = activePlan(useAppStore.getState()).students.map((s) => s.name);
    const result = parseNameList(text, existing);
    if (result.names.length === 0) {
      toast('info', 'Plak eerst een lijst met namen (één naam per regel).');
      return;
    }
    if (result.duplicates.length > 0) setPending(result);
    else commit(result.names, 0);
  };

  return (
    <Card title="Snelle invoer">
      <label htmlFor="bulk-names" className="sr-only">
        Namenlijst, één naam per regel
      </label>
      <textarea
        id="bulk-names"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPending(null);
        }}
        rows={5}
        placeholder={'Plak hier een namenlijst\n(één naam per regel)…'}
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {pending ? (
        <div className="mt-2 space-y-2">
          <Notice tone="amber">
            {pending.duplicates.length} naam{pending.duplicates.length === 1 ? '' : 'en'} komt al voor: <strong>{[...new Set(pending.duplicates)].join(', ')}</strong>.
            Dubbele namen zijn toegestaan (bijvoorbeeld twee leerlingen die Sam heten).
          </Notice>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => commit(pending.names, 0)}>
              Alles toevoegen
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const existing = new Set(activePlan(useAppStore.getState()).students.map((s) => s.name.toLocaleLowerCase('nl')));
                const unique: string[] = [];
                for (const n of pending.names) {
                  const k = n.toLocaleLowerCase('nl');
                  if (!existing.has(k)) {
                    existing.add(k);
                    unique.push(n);
                  }
                }
                commit(unique, pending.names.length - unique.length);
              }}
            >
              Dubbele overslaan
            </Button>
          </div>
        </div>
      ) : (
        <Button block className="mt-2" onClick={submit} disabled={!text.trim()}>
          Namen toevoegen
        </Button>
      )}
    </Card>
  );
}

export function StudentsTab() {
  const plan = useAppStore((s) => activePlan(s));
  const selectedId = useAppStore((s) => s.selectedStudentId);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const placed = useMemo(() => new Set(Object.values(plan.arrangement.assignments)), [plan.arrangement.assignments]);
  const locked = useMemo(() => new Set(plan.arrangement.locked), [plan.arrangement.locked]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('nl');
    const list = q ? plan.students.filter((s) => s.name.toLocaleLowerCase('nl').includes(q)) : plan.students;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }, [plan.students, query]);
  const selected = plan.students.find((s) => s.id === selectedId);
  const absentCount = plan.students.filter((s) => s.absent).length;

  return (
    <div className="space-y-3">
      <Card
        title={
          <>
            Leerlingen ({plan.students.length})
            {absentCount > 0 && <span className="ml-1 text-xs font-normal text-slate-500">· {absentCount} afwezig</span>}
          </>
        }
      >
        {adding ? (
          <AddStudentForm onDone={() => setAdding(false)} />
        ) : (
          <Button variant="primary" block icon={<Plus size={17} />} onClick={() => setAdding(true)}>
            Leerling toevoegen
          </Button>
        )}
        <div className="relative mt-2">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput aria-label="Zoek leerling" placeholder="Zoek leerling…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        {plan.students.length === 0 ? (
          <div className="mt-2">
            <EmptyState>Nog geen leerlingen. Voeg ze één voor één toe of plak hieronder een namenlijst.</EmptyState>
          </div>
        ) : (
          <ul className="scroll-thin mt-2 max-h-[min(420px,45vh)] overflow-y-auto rounded-lg border border-slate-200" aria-label="Leerlingenlijst">
            {filtered.map((s) => (
              <StudentRow key={s.id} student={s} plan={plan} selected={s.id === selectedId} locked={locked.has(s.id)} placed={placed.has(s.id)} />
            ))}
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Geen leerling gevonden voor "{query}".</li>}
          </ul>
        )}
        {plan.students.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">Tip: sleep een naam naar een tafel op de plattegrond om de leerling daar te plaatsen.</p>
        )}
      </Card>
      {selected && <SelectedStudent key={selected.id} plan={plan} student={selected} />}
      <BulkAdd />
    </div>
  );
}
