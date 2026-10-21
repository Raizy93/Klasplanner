import { ChevronDown, Lock, LockOpen, MousePointer2, TriangleAlert, UserMinus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Plan } from '../../models/types';
import { nameLookup } from '../../services/generator/buildProblem';
import { seatOfStudent, rulesForStudent } from '../../services/plan/planOps';
import { describeRule } from '../../services/rules/ruleMeta';
import { activePlan, useAppStore } from '../../store/appStore';
import { placeStudent, toggleStudentLock, unplaceStudent } from '../../store/seatActions';
import { getRuleEvaluations } from '../../store/selectors';
import { Button, IconButton } from '../ui/Button';
import { Select } from '../ui/primitives';
import type { SceneMode } from './DeskNode';

function ViolationBanner({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const openRuleDraft = useAppStore((s) => s.openRuleDraft);
  const violated = getRuleEvaluations(plan).filter((e) => e.status === 'violated' && e.rule.priority === 'hard');
  if (violated.length === 0) return null;
  const names = nameLookup(plan);
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 w-[min(460px,calc(100%-2rem))] -translate-x-1/2">
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 text-sm text-red-900 shadow-sm">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold">
          <TriangleAlert size={16} className="shrink-0 text-red-600" />
          <span className="flex-1">
            Bevat overtreden restricties ({violated.length})
          </span>
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <ul className="space-y-1 border-t border-red-200 px-3 py-2">
            <li className="text-xs text-red-800">Deze indeling voldoet niet aan alle ingestelde harde regels:</li>
            {violated.map((e) => (
              <li key={e.rule.id}>
                <button type="button" className="text-left underline decoration-red-300 underline-offset-2 hover:text-red-700" onClick={() => openRuleDraft({ editId: e.rule.id })}>
                  {describeRule(e.rule, names)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SeatPanel({ plan }: { plan: Plan }) {
  const selectedStudentId = useAppStore((s) => s.selectedStudentId);
  const selectedSeatId = useAppStore((s) => s.selectedSeatId);
  const selectStudent = useAppStore((s) => s.selectStudent);
  const selectSeat = useAppStore((s) => s.selectSeat);
  const update = useAppStore((s) => s.update);
  const setTab = useAppStore((s) => s.setTab);

  const student = plan.students.find((s) => s.id === selectedStudentId);
  const seatId = student ? seatOfStudent(plan.arrangement, student.id) : selectedSeatId;
  const seat = plan.room.seats.find((s) => s.id === seatId);
  const occupant = seat ? plan.students.find((s) => s.id === plan.arrangement.assignments[seat.id]) : undefined;
  const sortedSeats = useMemo(() => [...plan.room.seats].sort((a, b) => a.number - b.number), [plan.room.seats]);
  const placed = new Set(Object.values(plan.arrangement.assignments));

  if (!student && !seat) return null;
  const close = () => {
    selectStudent(null);
    selectSeat(null);
  };

  if (student) {
    const locked = plan.arrangement.locked.includes(student.id);
    const evals = getRuleEvaluations(plan).filter((e) => rulesForStudent(plan, student.id).some((r) => r.id === e.rule.id));
    const broken = evals.filter((e) => e.status === 'violated');
    const names = nameLookup(plan);
    return (
      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-md">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900">{student.name}</div>
            <div className="text-xs text-slate-500">
              {seat ? `Zitplaats ${seat.number}` : 'Niet geplaatst'}
              {student.absent && ' · afwezig'}
              {locked && ' · vastgezet'}
            </div>
          </div>
          <IconButton label="Paneel sluiten" size="sm" onClick={close}>
            <X size={16} />
          </IconButton>
        </div>
        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="seat-move">
          Verplaatsen naar zitplaats
        </label>
        <Select
          id="seat-move"
          value={seat?.id ?? ''}
          onChange={(e) => e.target.value && placeStudent(student.id, e.target.value)}
          className="mb-2 py-1.5"
        >
          <option value="">Kies een zitplaats…</option>
          {sortedSeats.map((s) => {
            const occ = plan.students.find((x) => x.id === plan.arrangement.assignments[s.id]);
            return (
              <option key={s.id} value={s.id} disabled={s.disabled}>
                {`Zitplaats ${s.number}`}
                {s.disabled ? ' (niet beschikbaar)' : occ ? ` – ${occ.name}${occ.id === student.id ? '' : ' (wisselen)'}` : ' – leeg'}
              </option>
            );
          })}
        </Select>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" disabled={!seat} onClick={() => toggleStudentLock(student.id)} icon={locked ? <LockOpen size={15} /> : <Lock size={15} />}>
            {locked ? 'Ontgrendelen' : 'Vastzetten'}
          </Button>
          <Button size="sm" disabled={!seat} onClick={() => unplaceStudent(student.id)} icon={<UserMinus size={15} />}>
            Van plek halen
          </Button>
        </div>
        {broken.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">
            {broken.map((e) => (
              <li key={e.rule.id} className="flex gap-1">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                <span>
                  {e.rule.priority === 'hard' ? 'Overtreden: ' : 'Voorkeur niet gehaald: '}
                  {describeRule(e.rule, names)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="mt-2 text-xs font-medium text-blue-700 hover:underline" onClick={() => setTab('students')}>
          Leerlinggegevens en regels bekijken →
        </button>
      </div>
    );
  }

  // Lege of geselecteerde zitplaats zonder leerling-selectie.
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-md">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-900">Zitplaats {seat!.number}</div>
          <div className="text-xs text-slate-500">{seat!.disabled ? 'Niet beschikbaar' : occupant ? occupant.name : 'Leeg'}</div>
        </div>
        <IconButton label="Paneel sluiten" size="sm" onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      {!seat!.disabled && (
        <>
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="seat-assign">
            Leerling plaatsen
          </label>
          <Select id="seat-assign" value="" onChange={(e) => e.target.value && placeStudent(e.target.value, seat!.id)} className="mb-2 py-1.5">
            <option value="">Kies een leerling…</option>
            {[...plan.students]
              .sort((a, b) => Number(placed.has(a.id)) - Number(placed.has(b.id)) || a.name.localeCompare(b.name, 'nl'))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {placed.has(s.id) ? ' (verplaatsen)' : ''}
                  {s.absent ? ' – afwezig' : ''}
                </option>
              ))}
          </Select>
        </>
      )}
      <Button
        size="sm"
        onClick={() =>
          update((d) => {
            const s = d.room.seats.find((x) => x.id === seat!.id);
            if (s) s.disabled = !s.disabled;
          })
        }
      >
        {seat!.disabled ? 'Weer beschikbaar maken' : 'Markeren als niet beschikbaar'}
      </Button>
    </div>
  );
}

export function CanvasOverlays({ mode }: { mode: SceneMode }) {
  const plan = useAppStore((s) => activePlan(s));
  const selection = useAppStore((s) => s.selection);
  const empty = plan.room.desks.length === 0;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm">
        <MousePointer2 size={13} />
        {mode === 'room' ? (
          <span>
            <strong className="text-slate-800">Lokaal bewerken</strong>
            <span className="hidden lg:inline"> · sleep om te selecteren · spatie + slepen = verschuiven</span>
          </span>
        ) : (
          <span>
            <strong className="text-slate-800">Leerlingen plaatsen</strong>
            <span className="hidden lg:inline"> · sleep een naam naar een andere tafel</span>
          </span>
        )}
      </div>
      {mode === 'seat' && <ViolationBanner plan={plan} />}
      {mode === 'seat' && <SeatPanel plan={plan} />}
      {empty && (
        <div className="absolute inset-x-0 top-1/3 mx-auto w-fit rounded-lg border border-slate-200 bg-white/95 px-4 py-3 text-center text-sm text-slate-600 shadow-sm">
          Dit lokaal heeft nog geen tafels.
          <br />
          Ga naar het tabblad <strong>Lokaal</strong> om tafels of groepjes toe te voegen.
        </div>
      )}
      {mode === 'room' && selection.length > 1 && (
        <div className="absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm">
          {selection.length} objecten geselecteerd
        </div>
      )}
    </div>
  );
}
