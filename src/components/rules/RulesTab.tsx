import { Pencil, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ID, Plan, Priority, Rule, RuleType, Strength } from '../../models/types';
import { buildProblem, nameLookup } from '../../services/generator/buildProblem';
import { addRule, removeRule, updateRule } from '../../services/plan/planOps';
import { ruleValidity } from '../../services/rules/evaluate';
import { describeRule, needsSeat, needsSecondStudent, RULE_META, RULE_TYPE_GROUPS, STRENGTH_LABELS } from '../../services/rules/ruleMeta';
import { precheck } from '../../solver/precheck';
import { activePlan, useAppStore, type RuleDraft } from '../../store/appStore';
import { getRuleEvaluations, getSeatGraph } from '../../store/selectors';
import { Button, IconButton } from '../ui/Button';
import { Card, Field, Notice, Select, Switch, TextInput } from '../ui/primitives';
import { ConflictList } from './ConflictList';
import { PriorityBadge, StatusText } from './RuleChip';

const SYMMETRIC: RuleType[] = ['beside', 'notBeside', 'sameGroup', 'notSameGroup', 'opposite', 'notOpposite'];

function sameRule(a: Omit<Rule, 'id' | 'createdAt' | 'enabled' | 'priority' | 'strength'>, b: Rule) {
  if (a.type !== b.type) return false;
  if (needsSeat(a.type)) return a.studentA === b.studentA && a.seatId === b.seatId;
  if (needsSecondStudent(a.type)) {
    return (
      (a.studentA === b.studentA && a.studentB === b.studentB) ||
      (SYMMETRIC.includes(a.type) && a.studentA === b.studentB && a.studentB === b.studentA)
    );
  }
  return a.studentA === b.studentA;
}

function RuleForm({ plan, draft }: { plan: Plan; draft: RuleDraft | null }) {
  const update = useAppStore((s) => s.update);
  const clearDraft = useAppStore((s) => s.clearRuleDraft);
  const editing = draft?.editId ? plan.rules.find((r) => r.id === draft.editId) : undefined;
  const [studentA, setStudentA] = useState<ID>(editing?.studentA ?? draft?.studentA ?? '');
  const [type, setType] = useState<RuleType>(editing?.type ?? 'front');
  const [studentB, setStudentB] = useState<ID>(editing?.studentB ?? '');
  const [seatId, setSeatId] = useState<ID>(editing?.seatId ?? '');
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'hard');
  const [strength, setStrength] = useState<Strength>(editing?.strength ?? 2);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (draft) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [draft]);

  const students = useMemo(() => [...plan.students].sort((a, b) => a.name.localeCompare(b.name, 'nl')), [plan.students]);
  const seats = useMemo(() => [...plan.room.seats].sort((a, b) => a.number - b.number), [plan.room.seats]);
  const pair = needsSecondStudent(type);
  const seatRule = needsSeat(type);

  const reset = () => {
    setStudentB('');
    setSeatId('');
    setError(null);
    clearDraft();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentA) return setError('Kies een leerling.');
    if (pair && !studentB) return setError('Kies de tweede leerling.');
    if (pair && studentB === studentA) return setError('Kies twee verschillende leerlingen.');
    if (seatRule && !seatId) return setError('Kies een zitplaats.');
    const input = { type, studentA, studentB: pair ? studentB : undefined, seatId: seatRule ? seatId : undefined, priority, strength, enabled: editing?.enabled ?? true };
    if (plan.rules.some((r) => r.id !== editing?.id && sameRule(input, r))) return setError('Deze regel bestaat al.');
    if (editing) update((d) => updateRule(d as Plan, editing.id, input));
    else update((d) => void addRule(d as Plan, input));
    reset();
    if (!editing) setStudentA(studentA);
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate aria-label={editing ? 'Regel bewerken' : 'Nieuwe regel'}>
      <Card title={editing ? 'Regel bewerken' : 'Nieuwe regel'}>
        <div className="space-y-3">
          <Field label="1. Leerling" htmlFor="rule-a">
            <Select id="rule-a" value={studentA} onChange={(e) => setStudentA(e.target.value)}>
              <option value="">Kies een leerling…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.absent ? ' (afwezig)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="2. Regeltype" htmlFor="rule-type">
            <Select id="rule-type" value={type} onChange={(e) => setType(e.target.value as RuleType)}>
              {RULE_TYPE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.types.map((t) => (
                    <option key={t} value={t}>
                      {RULE_META[t].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          {pair && (
            <Field label="3. Tweede leerling" htmlFor="rule-b">
              <Select id="rule-b" value={studentB} onChange={(e) => setStudentB(e.target.value)}>
                <option value="">Kies een leerling…</option>
                {students
                  .filter((s) => s.id !== studentA)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {seatRule && (
            <Field label="3. Zitplaats" htmlFor="rule-seat" hint="Zitplaatsnummers staan op de tafels in het tabblad Lokaal.">
              <Select id="rule-seat" value={seatId} onChange={(e) => setSeatId(e.target.value)}>
                <option value="">Kies een zitplaats…</option>
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    Zitplaats {s.number}
                    {s.disabled ? ' (niet beschikbaar)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-slate-700">{pair || seatRule ? '4' : '3'}. Prioriteit</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['hard', 'soft'] as Priority[]).map((p) => (
                <label
                  key={p}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    priority === p ? (p === 'hard' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50') : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="priority" checked={priority === p} onChange={() => setPriority(p)} className="accent-blue-600" />
                  <span>
                    <span className="font-medium">{p === 'hard' ? 'Harde restrictie' : 'Voorkeur'}</span>
                    <span className="block text-xs text-slate-500">{p === 'hard' ? 'Wordt nooit overtreden' : 'Zo goed mogelijk'}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {priority === 'soft' && (
            <Field label="Voorkeursterkte" htmlFor="rule-strength">
              <Select id="rule-strength" value={strength} onChange={(e) => setStrength(Number(e.target.value) as Strength)}>
                {([1, 2, 3] as Strength[]).map((s) => (
                  <option key={s} value={s}>
                    {STRENGTH_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-700">
              <TriangleAlert size={15} /> {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" block icon={editing ? undefined : <Plus size={16} />}>
              {editing ? 'Wijzigingen opslaan' : 'Regel toevoegen'}
            </Button>
            {editing && (
              <Button onClick={reset} className="shrink-0">
                Annuleren
              </Button>
            )}
          </div>
        </div>
      </Card>
    </form>
  );
}

type Filter = 'all' | 'hard' | 'soft' | 'problem';

export function RulesTab() {
  const plan = useAppStore((s) => activePlan(s));
  const draft = useAppStore((s) => s.ruleDraft);
  const highlight = useAppStore((s) => s.highlightRuleIds);
  const showZones = useAppStore((s) => s.showZones);
  const toggle = useAppStore((s) => s.toggle);
  const update = useAppStore((s) => s.update);
  const openRuleDraft = useAppStore((s) => s.openRuleDraft);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const names = nameLookup(plan);
  const graph = getSeatGraph(plan.room);
  const evals = getRuleEvaluations(plan);
  const evalById = useMemo(() => new Map(evals.map((e) => [e.rule.id, e])), [evals]);

  const live = useMemo(() => {
    const built = buildProblem(plan, getSeatGraph(plan.room));
    const labels: Record<string, string> = {};
    built.problem.constraints.forEach((c) => (labels[c.key] = c.label));
    return { conflicts: precheck(built.problem).filter((c) => c.kind !== 'capacity'), labels };
  }, [plan]);

  const usesRelations = plan.rules.some((r) => r.enabled && ['beside', 'notBeside', 'opposite', 'notOpposite'].includes(r.type));
  const ambiguousCount = graph.ambiguous.length;

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('nl');
    return plan.rules.filter((r) => {
      if (filter === 'hard' && r.priority !== 'hard') return false;
      if (filter === 'soft' && r.priority !== 'soft') return false;
      if (filter === 'problem') {
        const e = evalById.get(r.id);
        if (!(e?.status === 'violated' || e?.reason === 'invalid')) return false;
      }
      if (q && !describeRule(r, names).toLocaleLowerCase('nl').includes(q)) return false;
      return true;
    });
  }, [plan.rules, filter, query, evalById, names]);

  const counts = {
    all: plan.rules.length,
    hard: plan.rules.filter((r) => r.priority === 'hard').length,
    soft: plan.rules.filter((r) => r.priority === 'soft').length,
    problem: plan.rules.filter((r) => {
      const e = evalById.get(r.id);
      return e?.status === 'violated' || e?.reason === 'invalid';
    }).length,
  };

  return (
    <div className="space-y-3">
      {plan.students.length === 0 ? (
        <Notice tone="blue">Voeg eerst leerlingen toe in het tabblad Leerlingen.</Notice>
      ) : (
        <RuleForm key={`${draft?.nonce ?? 0}-${plan.id}`} plan={plan} draft={draft} />
      )}

      {live.conflicts.length > 0 && (
        <Card title="Tegenstrijdige regels">
          <ConflictList conflicts={live.conflicts} labels={live.labels} />
        </Card>
      )}

      {usesRelations && ambiguousCount > 0 && (
        <Notice tone="amber" icon={<TriangleAlert size={15} />}>
          Er {ambiguousCount === 1 ? 'is 1 tafelpaar' : `zijn ${ambiguousCount} tafelparen`} waarvan niet eenduidig is of ze naast of tegenover elkaar staan. Die
          plaatsen tellen niet mee voor "naast" en "tegenover". Bekijk de tafelgroepen in het tabblad Lokaal.
        </Notice>
      )}

      <Card title={`Alle regels (${plan.rules.length})`}>
        <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Regels filteren">
          {(
            [
              ['all', 'Alle'],
              ['hard', 'Hard'],
              ['soft', 'Voorkeur'],
              ['problem', 'Niet voldaan'],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === f ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {label} ({counts[f]})
            </button>
          ))}
        </div>
        {plan.rules.length > 5 && (
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput aria-label="Zoek in regels" placeholder="Zoek op naam…" value={query} onChange={(e) => setQuery(e.target.value)} className="py-1.5 pl-9" />
          </div>
        )}
        {plan.rules.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen regels. Zonder regels verdeelt de generator de leerlingen vrij over de zitplaatsen.</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((r) => {
              const e = evalById.get(r.id);
              const invalid = ruleValidity(r, plan);
              const text = describeRule(r, names);
              const hl = highlight.includes(r.id) || draft?.editId === r.id;
              return (
                <li
                  key={r.id}
                  className={`rounded-lg border px-2.5 py-2 ${hl ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'} ${!r.enabled ? 'bg-slate-50' : 'bg-white'} border-l-4 ${
                    r.priority === 'hard' ? 'border-l-red-400' : 'border-l-amber-400'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${r.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{text}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <PriorityBadge rule={r} />
                        {e && <StatusText status={e.status} reason={e.reason} />}
                      </div>
                      {invalid && <p className="mt-1 text-xs text-red-700">Ongeldig: {invalid} Deze regel wordt overgeslagen.</p>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <label className="sr-only" htmlFor={`en-${r.id}`}>
                        Regel {r.enabled ? 'uitschakelen' : 'inschakelen'}
                      </label>
                      <input
                        id={`en-${r.id}`}
                        type="checkbox"
                        role="switch"
                        checked={r.enabled}
                        title={r.enabled ? 'Ingeschakeld – klik om tijdelijk uit te schakelen' : 'Uitgeschakeld – klik om in te schakelen'}
                        onChange={() => update((d) => updateRule(d as Plan, r.id, { enabled: !r.enabled }))}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <IconButton size="sm" label={`Bewerken: ${text}`} onClick={() => openRuleDraft({ editId: r.id })}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton size="sm" label={`Verwijderen: ${text}`} onClick={() => update((d) => removeRule(d as Plan, r.id))}>
                        <Trash2 size={14} className="text-red-600" />
                      </IconButton>
                    </div>
                  </div>
                </li>
              );
            })}
            {list.length === 0 && <li className="text-sm text-slate-500">Geen regels in deze selectie.</li>}
          </ul>
        )}
      </Card>

      <Card title="Zo werken de zones">
        <div className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <p>
            De zones worden berekend uit de posities van alle beschikbare zitplaatsen, gezien vanaf de voorkant van het lokaal. Het gebied van de voorste
            tot de achterste zitplaats wordt in drie gelijke stroken verdeeld: <strong>vooraan</strong> is de voorste strook, <strong>achteraan</strong> de
            achterste.
          </p>
          <p>
            <strong>Links</strong>, <strong>midden</strong> en <strong>rechts</strong> zijn drie gelijke stroken van links naar rechts, gezien vanuit de
            leerlingen die naar de voorkant kijken.
          </p>
          <p>
            <strong>Naast elkaar</strong>: tafels die zij aan zij in hetzelfde groepje staan. <strong>Tegenover</strong>: tafels in hetzelfde groepje die recht
            tegenover elkaar staan. <strong>Hetzelfde groepje</strong>: tafels met dezelfde (gekoppelde) tafelgroep.
          </p>
          <Switch checked={showZones} onChange={() => toggle('showZones')} label="Zones tonen op de plattegrond" />
        </div>
      </Card>
    </div>
  );
}
