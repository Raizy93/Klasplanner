import { ChevronLeft, ChevronRight, Info, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ID, Plan, SocioDimension, SocioGoal, Strength } from '../../models/types';
import { addRule, removeRule } from '../../services/plan/planOps';
import { analyzeSociogram } from '../../services/sociogram/analysis';
import {
  choiceCount,
  choiceOf,
  DIMENSION_LABELS,
  nextChoice,
  setChoice,
  setFilledIn,
  type ChoiceState,
} from '../../services/sociogram/sociogramOps';
import { buildSuggestions, KIND_META, kindsForGoal, suggestionNote, type Suggestion, type SuggestionKind } from '../../services/sociogram/suggestions';
import { activePlan, useAppStore } from '../../store/appStore';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { Card, Checkbox, Field, Notice, Select, TextInput } from '../ui/primitives';
import { Down, HideButton, PrivacyGate, Up, useStudentName } from './shared';

const CHIP: Record<ChoiceState, string> = {
  none: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  pos: 'border-green-400 bg-green-100 text-green-900',
  neg: 'border-red-300 bg-red-100 text-red-900',
};
const STATE_LABEL: Record<ChoiceState, string> = { none: 'geen keuze', pos: 'graag', neg: 'liever niet' };

function ChoiceChips({ plan, studentId, dim }: { plan: Plan; studentId: ID; dim: SocioDimension }) {
  const update = useAppStore((s) => s.update);
  const resp = plan.sociogram.responses[studentId];
  const others = useMemo(() => [...plan.students].filter((s) => s.id !== studentId).sort((a, b) => a.name.localeCompare(b.name, 'nl')), [plan.students, studentId]);
  const verb = dim === 'work' ? 'samenwerken' : 'spelen';
  return (
    <div role="group" aria-label={`${DIMENSION_LABELS[dim]}: keuzes`} className="flex flex-wrap gap-1">
      {others.map((o) => {
        const state = choiceOf(resp, dim, o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => update((d) => setChoice(d as Plan, studentId, o.id, dim, nextChoice(state)), { coalesceKey: `socio:${studentId}` })}
            aria-label={`${o.name}: ${STATE_LABEL[state]} ${verb}. Klik om te wijzigen.`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] ${CHIP[state]}`}
          >
            {state === 'pos' && <Up size={12} />}
            {state === 'neg' && <Down size={12} />}
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function ResponseEditor({ plan, studentId }: { plan: Plan; studentId: ID }) {
  const update = useAppStore((s) => s.update);
  const name = useStudentName();
  const resp = plan.sociogram.responses[studentId];
  const [confirmClear, setConfirmClear] = useState(false);
  const received = (dim: SocioDimension) => {
    const an = analyzeSociogram(plan, dim).stats.get(studentId);
    return an ? `${an.posIn} keer graag, ${an.negIn} keer liever niet` : '';
  };
  const list = (ids: ID[]) => (ids.length ? ids.map(name).join(', ') : '–');

  return (
    <div className="space-y-3">
      <Checkbox
        checked={!!resp}
        onChange={(v) => (v || choiceCount(resp) === 0 ? update((d) => setFilledIn(d as Plan, studentId, v)) : setConfirmClear(true))}
        label="Formulier ingevuld"
      />
      {(['work', 'play'] as SocioDimension[]).map((dim) => (
        <div key={dim} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900">{DIMENSION_LABELS[dim]}</h4>
            <span className="text-xs text-slate-500">Gekozen: {received(dim)}</span>
          </div>
          <ChoiceChips plan={plan} studentId={studentId} dim={dim} />
          {resp && (
            <dl className="space-y-0.5 text-xs text-slate-600">
              <div className="flex gap-1">
                <dt className="flex shrink-0 items-center gap-1 font-medium">
                  <Up size={12} /> Graag:
                </dt>
                <dd>{list(dim === 'work' ? resp.workPos : resp.playPos)}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="flex shrink-0 items-center gap-1 font-medium">
                  <Down size={12} /> Liever niet:
                </dt>
                <dd>{list(dim === 'work' ? resp.workNeg : resp.playNeg)}</dd>
              </div>
            </dl>
          )}
        </div>
      ))}
      <p className="text-xs text-slate-500">Klik op een naam: eerst "graag", nog eens "liever niet", nog eens leeg.</p>
      <ConfirmDialog
        open={confirmClear}
        title="Antwoorden wissen"
        message={`Alle sociogramkeuzes van ${name(studentId)} worden gewist. Dit kun je ongedaan maken met Ctrl+Z.`}
        confirmLabel="Wissen"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          update((d) => setFilledIn(d as Plan, studentId, false));
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

function InputCard({ plan }: { plan: Plan }) {
  const socioStudentId = useAppStore((s) => s.socioStudentId);
  const setSocio = useAppStore((s) => s.setSocio);
  const students = useMemo(() => [...plan.students].sort((a, b) => a.name.localeCompare(b.name, 'nl')), [plan.students]);
  const current = students.find((s) => s.id === socioStudentId) ?? students[0];
  const idx = current ? students.indexOf(current) : -1;
  const filled = (id: ID) => !!plan.sociogram.responses[id];
  const go = (i: number) => students[i] && setSocio({ socioStudentId: students[i].id });
  const nextOpen = students.findIndex((s, i) => i > idx && !filled(s.id));

  if (!current) return <Notice tone="blue">Voeg eerst leerlingen toe in het tabblad Leerlingen.</Notice>;
  return (
    <Card title="Antwoorden invoeren">
      <div className="mb-3 flex items-center gap-1">
        <IconButton label="Vorige leerling" disabled={idx <= 0} onClick={() => go(idx - 1)}>
          <ChevronLeft size={18} />
        </IconButton>
        <Select aria-label="Leerling" value={current.id} onChange={(e) => setSocio({ socioStudentId: e.target.value })} className="py-1.5">
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {filled(s.id) ? '✓ ' : ' '}
              {s.name}
            </option>
          ))}
        </Select>
        <IconButton label="Volgende leerling" disabled={idx >= students.length - 1} onClick={() => go(idx + 1)}>
          <ChevronRight size={18} />
        </IconButton>
      </div>
      <ResponseEditor key={current.id} plan={plan} studentId={current.id} />
      {nextOpen >= 0 && (
        <Button size="sm" className="mt-3" onClick={() => go(nextOpen)}>
          Naar volgende nog niet ingevulde ({students[nextOpen].name})
        </Button>
      )}
    </Card>
  );
}

type StrengthChoice = Strength | 'hard';
const GOAL_LABELS: Record<SocioGoal, string> = {
  none: 'Geen doel (alleen negatieve relaties scheiden)',
  reinforce: 'Bestaande relaties bekrachtigen',
  build: 'Nieuwe relaties laten ontstaan',
};

function SuggestionsCard({ plan }: { plan: Plan }) {
  const update = useAppStore((s) => s.update);
  const toast = useAppStore((s) => s.toast);
  const name = useStudentName();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [strengths, setStrengths] = useState<Record<string, StrengthChoice>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const goals = plan.sociogram.goals;

  const groups = useMemo(() => {
    const out: { dim: SocioDimension; kind: SuggestionKind; defaultChecked: boolean; items: Suggestion[] }[] = [];
    for (const dim of ['work', 'play'] as SocioDimension[]) {
      const all = buildSuggestions(plan, dim, goals[dim]);
      for (const { kind, checked } of kindsForGoal(goals[dim])) {
        const items = all.filter((s) => s.kind === kind);
        if (items.length) out.push({ dim, kind, defaultChecked: checked, items });
      }
    }
    return out;
  }, [plan, goals]);

  const isChecked = (s: Suggestion, def: boolean) => overrides[s.key] ?? (def && !s.exists && !s.conflictsWith);
  const strengthOf = (dim: SocioDimension, kind: SuggestionKind): StrengthChoice => strengths[`${dim}:${kind}`] ?? KIND_META[kind].defaultStrength;
  // Hetzelfde paar kan bij samenwerken én spelen voorkomen: één regel is genoeg.
  const selected = (() => {
    const seen = new Set<string>();
    return groups
      .flatMap((g) => g.items.filter((s) => !s.exists && isChecked(s, g.defaultChecked)).map((s) => ({ s, g })))
      .filter(({ s }) => {
        const k = `${s.type}:${[s.a, s.b].sort().join('|')}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  })();
  const sociogramRules = plan.rules.filter((r) => r.source === 'sociogram');

  const addSelected = () => {
    let n = 0;
    update((d) => {
      for (const { s, g } of selected) {
        const st = strengthOf(g.dim, g.kind);
        addRule(d as Plan, {
          type: s.type,
          studentA: s.a,
          studentB: s.b,
          priority: st === 'hard' ? 'hard' : 'soft',
          strength: st === 'hard' ? 2 : st,
          enabled: true,
          source: 'sociogram',
          note: suggestionNote(s),
        });
        n++;
      }
    });
    setOverrides({});
    toast('success', `${n} regel${n === 1 ? '' : 's'} toegevoegd. Je vindt ze in het tabblad Regels (label "Sociogram").`);
  };

  return (
    <Card title="Groepjes maken met het sociogram">
      <div className="space-y-3">
        <p className="text-[13px] text-slate-600">
          Kies per vraag een doel. De tool stelt regels voor; jij bepaalt welke je toevoegt. Voorgestelde regels zijn voorkeuren, tenzij je "Harde restrictie" kiest.
        </p>
        {(['work', 'play'] as SocioDimension[]).map((dim) => (
          <Field key={dim} label={DIMENSION_LABELS[dim]} htmlFor={`goal-${dim}`}>
            <Select
              id={`goal-${dim}`}
              value={goals[dim]}
              onChange={(e) => update((d) => void (d.sociogram.goals[dim] = e.target.value as SocioGoal))}
            >
              {(Object.keys(GOAL_LABELS) as SocioGoal[]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
        ))}

        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">Geen voorstellen: voer eerst antwoorden in of kies een doel.</p>
        ) : (
          groups.map((g) => {
            const meta = KIND_META[g.kind];
            const gkey = `${g.dim}:${g.kind}`;
            const open = g.items.filter((s) => !s.exists);
            return (
              <fieldset key={gkey} className="rounded-lg border border-slate-200 p-2.5">
                <legend className="px-1 text-[13px] font-semibold text-slate-800">
                  {DIMENSION_LABELS[g.dim]} · {meta.label} ({g.items.length})
                </legend>
                <p className="mb-2 text-xs text-slate-500">{meta.explanation}</p>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700 hover:underline"
                    onClick={() => {
                      const all = open.every((s) => isChecked(s, g.defaultChecked));
                      setOverrides((o) => ({ ...o, ...Object.fromEntries(open.map((s) => [s.key, !all])) }));
                    }}
                  >
                    Alles aan/uit
                  </button>
                  <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
                    Als
                    <select
                      value={String(strengthOf(g.dim, g.kind))}
                      onChange={(e) => setStrengths((s) => ({ ...s, [gkey]: e.target.value === 'hard' ? 'hard' : (Number(e.target.value) as Strength) }))}
                      className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                    >
                      <option value="1">lage voorkeur</option>
                      <option value="2">normale voorkeur</option>
                      <option value="3">sterke voorkeur</option>
                      {meta.type === 'notSameGroup' && <option value="hard">harde restrictie</option>}
                    </select>
                  </label>
                </div>
                <ul className="space-y-1">
                  {g.items.map((s) => (
                    <li key={s.key} className="text-[13px]">
                      <label className={`flex items-start gap-2 ${s.exists ? 'text-slate-400' : 'text-slate-800'}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-blue-600"
                          disabled={s.exists}
                          checked={!s.exists && isChecked(s, g.defaultChecked)}
                          onChange={(e) => setOverrides((o) => ({ ...o, [s.key]: e.target.checked }))}
                        />
                        <span>
                          {name(s.a)} &amp; {name(s.b)}
                          {s.exists && <span className="ml-1 text-xs">(regel bestaat al)</span>}
                          {s.conflictsWith && <span className="ml-1 text-xs text-amber-700">(botst met een bestaande regel)</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })
        )}
        <Button variant="primary" block disabled={selected.length === 0} onClick={addSelected}>
          {selected.length === 0 ? 'Geen regels geselecteerd' : `${selected.length} regel${selected.length === 1 ? '' : 's'} toevoegen`}
        </Button>
        {sociogramRules.length > 0 && (
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmRemove(true)}>
            Alle sociogramregels verwijderen ({sociogramRules.length})
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Sociogramregels verwijderen"
        message={`${sociogramRules.length} regels die vanuit het sociogram zijn gemaakt worden verwijderd. Handmatig gemaakte regels blijven staan. Ongedaan maken kan met Ctrl+Z.`}
        confirmLabel="Verwijderen"
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          update((d) => sociogramRules.forEach((r) => removeRule(d as Plan, r.id)));
          setConfirmRemove(false);
        }}
      />
    </Card>
  );
}

export function SociogramTab() {
  const plan = useAppStore((s) => activePlan(s));
  const revealed = useAppStore((s) => s.socioRevealed);
  const update = useAppStore((s) => s.update);
  if (!revealed) return <PrivacyGate compact />;
  const filled = plan.students.filter((s) => plan.sociogram.responses[s.id]).length;

  return (
    <div className="space-y-3">
      <Card title="Afname" actions={<HideButton />}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Afnamedatum" htmlFor="socio-date">
              <TextInput
                id="socio-date"
                type="date"
                value={plan.sociogram.date ?? ''}
                onChange={(e) => update((d) => void (d.sociogram.date = e.target.value || undefined))}
              />
            </Field>
          </div>
          <div className="pb-2 text-sm text-slate-700">
            <strong>{filled}</strong> van {plan.students.length} ingevuld
          </div>
        </div>
        <p className="mt-2 flex gap-1.5 text-xs text-slate-500">
          <Info size={14} className="mt-px shrink-0" />
          Het overzicht en de snelle matrixinvoer staan rechts. De gegevens komen nooit in de PNG- of PDF-export van de plattegrond.
        </p>
      </Card>
      <InputCard plan={plan} />
      <SuggestionsCard plan={plan} />
    </div>
  );
}
