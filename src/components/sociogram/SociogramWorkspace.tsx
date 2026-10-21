import { ArrowUpDown, Grid3x3, Map as MapIcon, Table2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { ID, Plan } from '../../models/types';
import {
  analyzeSociogram,
  MIN_RESPONDENTS_FOR_STATUS,
  STATUS_DESCRIPTIONS,
  type SocioAnalysis,
  type SocioStatus,
  type SocioStudentStats,
} from '../../services/sociogram/analysis';
import { choiceOf, nextChoice, setChoice } from '../../services/sociogram/sociogramOps';
import { activePlan, useAppStore, type SocioView } from '../../store/appStore';
import { Card, Notice } from '../ui/primitives';
import { DimensionSwitch, Down, HideButton, PairRuleMenu, PrivacyGate, StatusBadge, Up, useStudentName } from './shared';

function NameChip({ id, onClick }: { id: ID; onClick?: () => void }) {
  const name = useStudentName();
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[13px] text-slate-800 hover:border-blue-300 hover:bg-blue-50">
      {name(id)}
    </button>
  );
}

function PairList({
  title,
  description,
  pairs,
  render,
  dimension,
  reason,
  tone,
}: {
  title: string;
  description: string;
  pairs: { a: ID; b: ID }[];
  render: (a: ID, b: ID) => ReactNode;
  dimension: 'work' | 'play';
  reason: string;
  tone: 'green' | 'red' | 'amber' | 'slate';
}) {
  const border = { green: 'border-t-green-400', red: 'border-t-red-400', amber: 'border-t-amber-400', slate: 'border-t-slate-300' }[tone];
  return (
    <section className={`rounded-xl border border-t-4 border-slate-200 bg-white p-3 ${border}`}>
      <h4 className="text-sm font-semibold text-slate-900">
        {title} <span className="font-normal text-slate-500">({pairs.length})</span>
      </h4>
      <p className="mb-2 text-xs text-slate-500">{description}</p>
      {pairs.length === 0 ? (
        <p className="text-[13px] text-slate-400">Geen.</p>
      ) : (
        <ul className="scroll-thin max-h-64 space-y-0.5 overflow-y-auto">
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="flex items-center gap-1 rounded px-1 text-[13px] text-slate-800 hover:bg-slate-50">
              <span className="flex flex-1 items-center gap-1">{render(p.a, p.b)}</span>
              <PairRuleMenu a={p.a} b={p.b} dimension={dimension} reason={reason} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type SortKey = 'name' | 'posIn' | 'negIn' | 'posOut' | 'negOut' | 'mutualPos' | 'status';
const STATUS_ORDER: Record<SocioStatus, number> = { rejected: 0, neglected: 1, controversial: 2, popular: 3, average: 4 };

function StudentTable({ an, plan }: { an: SocioAnalysis; plan: Plan }) {
  const name = useStudentName();
  const setSocio = useAppStore((s) => s.setSocio);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });
  const rows = useMemo(() => {
    const list = plan.students.map((s) => an.stats.get(s.id)!);
    const val = (r: SocioStudentStats): number | string =>
      sort.key === 'name' ? name(r.id).toLocaleLowerCase('nl') : sort.key === 'status' ? (r.status ? STATUS_ORDER[r.status] : 9) : r[sort.key];
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'nl') : (x as number) - (y as number);
      return sort.desc ? -c : c;
    });
  }, [an, plan.students, sort, name]);

  const th = (key: SortKey, label: ReactNode, title: string) => (
    <th scope="col" className="px-2 py-1.5 text-left font-medium" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" title={title} className="inline-flex items-center gap-1 hover:text-blue-700" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>
        {label}
        <ArrowUpDown size={12} className="opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="border-b border-slate-200 text-xs text-slate-600">
          <tr>
            {th('name', 'Naam', 'Sorteer op naam')}
            {th('posIn', <><Up size={12} /> ontvangen</>, 'Aantal keer positief gekozen')}
            {th('negIn', <><Down size={12} /> ontvangen</>, 'Aantal keer negatief gekozen')}
            {th('posOut', <><Up size={12} /> gegeven</>, 'Aantal positieve keuzes die de leerling zelf maakte')}
            {th('negOut', <><Down size={12} /> gegeven</>, 'Aantal negatieve keuzes die de leerling zelf maakte')}
            {th('mutualPos', 'Wederzijds', 'Aantal wederzijds positieve keuzes')}
            {th('status', 'Positie', 'Sociometrische positie (indicatie)')}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-1">
                <button type="button" className="text-left font-medium text-slate-900 hover:text-blue-700 hover:underline" onClick={() => setSocio({ socioStudentId: r.id })}>
                  {name(r.id)}
                </button>
                {!r.filledIn && <span className="ml-1 text-xs text-slate-400">(niet ingevuld)</span>}
              </td>
              <td className="px-2 py-1 tabular-nums">{r.posIn}</td>
              <td className="px-2 py-1 tabular-nums">{r.negIn}</td>
              <td className="px-2 py-1 tabular-nums text-slate-500">{r.filledIn ? r.posOut : '–'}</td>
              <td className="px-2 py-1 tabular-nums text-slate-500">{r.filledIn ? r.negOut : '–'}</td>
              <td className="px-2 py-1 tabular-nums">{r.mutualPos}</td>
              <td className="px-2 py-1">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ plan }: { plan: Plan }) {
  const dim = useAppStore((s) => s.socioDimension);
  const setSocio = useAppStore((s) => s.setSocio);
  const name = useStudentName();
  const an = useMemo(() => analyzeSociogram(plan, dim), [plan, dim]);
  const select = (id: ID) => setSocio({ socioStudentId: id });
  const byStatus = (st: SocioStatus) => plan.students.filter((s) => an.stats.get(s.id)!.status === st).map((s) => s.id);
  const notFilled = plan.students.filter((s) => !an.stats.get(s.id)!.filledIn).map((s) => s.id);
  const pair = (a: ID, b: ID, mid: ReactNode) => (
    <>
      <span>{name(a)}</span>
      {mid}
      <span>{name(b)}</span>
    </>
  );

  if (plan.students.length === 0) return <Notice tone="blue">Voeg eerst leerlingen toe.</Notice>;

  return (
    <div className="space-y-4">
      <Card title="Wie valt op?">
        {!an.statusAvailable ? (
          <Notice tone="blue">
            Er zijn nog te weinig formulieren ingevuld ({an.respondents}). Vanaf {MIN_RESPONDENTS_FOR_STATUS} ingevulde formulieren berekent de tool wie opvalt.
          </Notice>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(['popular', 'controversial', 'rejected', 'neglected'] as SocioStatus[]).map((st) => (
              <div key={st}>
                <div className="flex items-center gap-2">
                  <StatusBadge status={st} />
                  <span className="text-xs text-slate-500">{STATUS_DESCRIPTIONS[st]}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {byStatus(st).length ? byStatus(st).map((id) => <NameChip key={id} id={id} onClick={() => select(id)} />) : <span className="text-[13px] text-slate-400">Niemand</span>}
                </div>
              </div>
            ))}
            <div>
              <div className="text-[13px] font-semibold text-slate-800">Door niemand positief gekozen</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {an.noPositive.length ? an.noPositive.map((id) => <NameChip key={id} id={id} onClick={() => select(id)} />) : <span className="text-[13px] text-slate-400">Niemand</span>}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-800">Formulier niet ingevuld</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {notFilled.length ? notFilled.map((id) => <NameChip key={id} id={id} onClick={() => select(id)} />) : <span className="text-[13px] text-slate-400">Iedereen heeft ingevuld</span>}
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Posities volgens de gangbare sociometrische methode (Coie &amp; Dodge), berekend uit de ontvangen keuzes ten opzichte van de rest van de groep.
          Een sociogram is een momentopname: gebruik dit als startpunt voor observatie en gesprek, niet als oordeel. Leerlingen die niet invulden worden
          wel gekozen, maar kiezen zelf niet.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <PairList
          title="Kiezen elkaar positief"
          description="Beide leerlingen kiezen elkaar positief."
          pairs={an.mutualPos}
          render={(a, b) => pair(a, b, <span className="flex items-center"><Up size={12} /><Up size={12} /></span>)}
          dimension={dim}
          reason="wederzijds positief"
          tone="green"
        />
        <PairList
          title="Kiezen elkaar negatief"
          description="Beide leerlingen kiezen elkaar negatief."
          pairs={an.mutualNeg}
          render={(a, b) => pair(a, b, <span className="flex items-center"><Down size={12} /><Down size={12} /></span>)}
          dimension={dim}
          reason="wederzijds negatief"
          tone="red"
        />
        <PairList
          title="Tegengestelde keuze"
          description="De eerste kiest de tweede positief, maar de tweede kiest de eerste juist negatief."
          pairs={an.conflicting.map((p) => ({ a: p.from, b: p.to }))}
          render={(a, b) => (
            <>
              <span>{name(a)}</span>
              <Up size={12} />
              <span className="text-slate-400">→</span>
              <span>{name(b)}</span>
              <span className="text-slate-400">→</span>
              <Down size={12} />
            </>
          )}
          dimension={dim}
          reason="tegengestelde keuze"
          tone="amber"
        />
        <PairList
          title="Eenzijdig positief"
          description="De eerste kiest de tweede positief; de tweede koos de eerste niet (kansrijke nieuwe relatie)."
          pairs={an.oneSidedPos.map((p) => ({ a: p.from, b: p.to }))}
          render={(a, b) => (
            <>
              <span>{name(a)}</span>
              <Up size={12} />
              <span className="text-slate-400">→</span>
              <span>{name(b)}</span>
            </>
          )}
          dimension={dim}
          reason="eenzijdig positief"
          tone="slate"
        />
      </div>

      <Card title={`Hechte groepjes (${an.clusters.length})`}>
        <p className="mb-2 text-xs text-slate-500">Groepjes van drie of meer leerlingen die elkaar allemaal wederzijds positief kiezen.</p>
        {an.clusters.length === 0 ? (
          <p className="text-[13px] text-slate-400">Geen hechte groepjes gevonden.</p>
        ) : (
          <ul className="space-y-1.5">
            {an.clusters.map((c) => (
              <li key={c.join()} className="flex flex-wrap gap-1">
                {c.map((id) => (
                  <NameChip key={id} id={id} onClick={() => select(id)} />
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Alle leerlingen">
        <StudentTable an={an} plan={plan} />
      </Card>
    </div>
  );
}

const CELL: Record<string, string> = {
  none: 'bg-white hover:bg-slate-100 text-transparent',
  pos: 'bg-green-200 text-green-900 hover:bg-green-300',
  neg: 'bg-red-200 text-red-900 hover:bg-red-300',
};

function Matrix({ plan }: { plan: Plan }) {
  const dim = useAppStore((s) => s.socioDimension);
  const setSocio = useAppStore((s) => s.setSocio);
  const selectedId = useAppStore((s) => s.socioStudentId);
  const update = useAppStore((s) => s.update);
  const students = useMemo(() => [...plan.students].sort((a, b) => a.name.localeCompare(b.name, 'nl')), [plan.students]);
  const an = useMemo(() => analyzeSociogram(plan, dim), [plan, dim]);
  const verb = dim === 'work' ? 'samenwerken' : 'spelen';

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-slate-600">
        Rij = wie kiest, kolom = wie gekozen wordt. Klik op een vakje: <strong>+</strong> graag, nog eens <strong>−</strong> liever niet, nog eens leeg.
      </p>
      <div className="scroll-thin max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 bg-white px-2 text-left align-bottom text-xs font-medium text-slate-500">Kiest ↓ / gekozen →</th>
              {students.map((s) => (
                <th key={s.id} scope="col" className="h-24 w-7 border-l border-slate-100 align-bottom font-medium text-slate-700">
                  <span className="inline-block max-h-24 overflow-hidden whitespace-nowrap py-1" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {s.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((row) => {
              const resp = plan.sociogram.responses[row.id];
              return (
                <tr key={row.id} className={selectedId === row.id ? 'bg-blue-50' : ''}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-t border-slate-100 bg-inherit bg-white px-2 text-left font-medium">
                    <button type="button" className="hover:text-blue-700 hover:underline" onClick={() => setSocio({ socioStudentId: row.id })}>
                      {resp ? '✓ ' : ''}
                      {row.name}
                    </button>
                  </th>
                  {students.map((col) => {
                    if (col.id === row.id) return <td key={col.id} className="h-7 w-7 border-l border-t border-slate-100 bg-slate-200" aria-hidden />;
                    const state = choiceOf(resp, dim, col.id);
                    return (
                      <td key={col.id} className="h-7 w-7 border-l border-t border-slate-100 p-0">
                        <button
                          type="button"
                          className={`h-7 w-7 font-bold ${CELL[state]}`}
                          aria-label={`${row.name} over ${col.name}: ${state === 'pos' ? 'graag' : state === 'neg' ? 'liever niet' : 'geen keuze'} ${verb}`}
                          onClick={() => update((d) => setChoice(d as Plan, row.id, col.id, dim, nextChoice(state)), { coalesceKey: `socio:${row.id}` })}
                        >
                          {state === 'pos' ? '+' : state === 'neg' ? '−' : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-50 text-[11px]">
            <tr>
              <th scope="row" className="sticky left-0 bg-slate-50 px-2 text-left font-medium text-green-800">
                + ontvangen
              </th>
              {students.map((s) => (
                <td key={s.id} className="border-l border-slate-100 text-center tabular-nums text-green-800">
                  {an.stats.get(s.id)!.posIn}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 bg-slate-50 px-2 text-left font-medium text-red-800">
                − ontvangen
              </th>
              {students.map((s) => (
                <td key={s.id} className="border-l border-slate-100 text-center tabular-nums text-red-800">
                  {an.stats.get(s.id)!.negIn}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const VIEWS: { id: SocioView; label: string; icon: typeof Table2 }[] = [
  { id: 'overview', label: 'Overzicht', icon: Table2 },
  { id: 'matrix', label: 'Matrix', icon: Grid3x3 },
  { id: 'plan', label: 'Plattegrond', icon: MapIcon },
];

/** Bovenbalk om te wisselen tussen overzicht, matrix en plattegrond (ook zichtbaar boven de plattegrond). */
export function SocioViewBar() {
  const view = useAppStore((s) => s.socioView);
  const setSocio = useAppStore((s) => s.setSocio);
  const revealed = useAppStore((s) => s.socioRevealed);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div role="tablist" aria-label="Sociogramweergave" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setSocio({ socioView: v.id })}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium ${view === v.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Icon size={15} /> {v.label}
            </button>
          );
        })}
      </div>
      {view !== 'plan' && revealed && <DimensionSwitch />}
      {view !== 'plan' && revealed && (
        <div className="ml-auto">
          <HideButton />
        </div>
      )}
    </div>
  );
}

export function SociogramWorkspace() {
  const plan = useAppStore((s) => activePlan(s));
  const view = useAppStore((s) => s.socioView);
  const revealed = useAppStore((s) => s.socioRevealed);
  const dim = useAppStore((s) => s.socioDimension);
  const respondents = plan.students.filter((s) => plan.sociogram.responses[s.id]).length;
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-[#eef1f5] p-4">
      {!revealed ? (
        <div className="mx-auto mt-10 max-w-lg">
          <PrivacyGate />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Sociogram – {dim === 'work' ? 'samenwerken' : 'samen spelen'}
            </h2>
            <span className="text-sm text-slate-600">
              {respondents} van {plan.students.length} formulieren ingevuld
              {plan.sociogram.date && ` · afgenomen op ${new Date(plan.sociogram.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </span>
          </div>
          {view === 'matrix' ? <Matrix plan={plan} /> : <Overview plan={plan} />}
        </div>
      )}
    </div>
  );
}
