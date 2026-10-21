import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CircleCheck,
  Clock,
  Eraser,
  GripVertical,
  LoaderCircle,
  LockOpen,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Plan } from '../../models/types';
import { buildProblem, nameLookup } from '../../services/generator/buildProblem';
import { clearArrangement } from '../../services/plan/planOps';
import { describeRule } from '../../services/rules/ruleMeta';
import { summarize } from '../../services/rules/evaluate';
import { precheck } from '../../solver/precheck';
import { activePlan, useAppStore, type GenerationReport } from '../../store/appStore';
import { getRuleEvaluations, getSeatGraph } from '../../store/selectors';
import { createId } from '../../utils/id';
import { STUDENT_DRAG_TYPE } from '../canvas/canvasApi';
import { ConflictList } from '../rules/ConflictList';
import { Button, IconButton } from '../ui/Button';
import { Card, Notice, Switch, TextInput } from '../ui/primitives';

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ReportCard({ report, plan }: { report: GenerationReport; plan: Plan }) {
  const openRuleDraft = useAppStore((s) => s.openRuleDraft);
  const names = nameLookup(plan);

  if (report.status === 'infeasible') {
    return (
      <Card title="Geen geldige indeling mogelijk">
        <div className="space-y-3">
          {report.conflicts && report.conflicts.length > 0 ? (
            <ConflictList conflicts={report.conflicts} labels={report.labels ?? {}} />
          ) : (
            <Notice tone="red" icon={<TriangleAlert size={15} />}>
              Er is aantoonbaar geen indeling die aan alle harde restricties voldoet, maar de precieze oorzaak kon niet binnen de rekentijd worden vastgesteld.
            </Notice>
          )}
          <div className="text-[13px] text-slate-600">
            <p className="font-medium text-slate-800">Mogelijke oplossingen:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>Maak één van de genoemde regels een voorkeur in plaats van een harde restrictie.</li>
              <li>Schakel een regel tijdelijk uit in het tabblad Regels.</li>
              <li>Ontgrendel vastgezette leerlingen of voeg zitplaatsen toe.</li>
            </ul>
          </div>
        </div>
      </Card>
    );
  }
  if (report.status === 'timeout') {
    return (
      <Card title="Geen oplossing gevonden binnen de tijdslimiet">
        <div className="space-y-2 text-[13px] text-slate-700">
          <Notice tone="amber" icon={<Clock size={15} />}>
            De generator heeft binnen de beschikbare rekentijd geen geldige indeling gevonden. Dit betekent <strong>niet</strong> dat de regels onmogelijk zijn.
          </Notice>
          <p>Probeer het nog eens, of maak enkele harde restricties een voorkeur. De huidige indeling is niet gewijzigd.</p>
        </div>
      </Card>
    );
  }
  if (report.status === 'error') {
    return (
      <Notice tone="red" icon={<TriangleAlert size={15} />}>
        Er ging iets mis bij het genereren: {report.error}
      </Notice>
    );
  }

  const s = report.summary!;
  const pct = s.softTotal ? Math.round((s.softSatisfied / s.softTotal) * 100) : 100;
  const skippedAbsent = report.skipped?.filter((x) => x.reason === 'absent').length ?? 0;
  const skippedInvalid = report.skipped?.filter((x) => x.reason === 'invalid') ?? [];
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CircleCheck size={18} className="text-green-600" /> Indeling gegenereerd
        </span>
      }
    >
      <ul className="space-y-1 text-sm text-slate-700">
        <li>
          <strong>{report.placed}</strong> leerlingen geplaatst{report.reservedCount ? ` (${report.reservedCount} plek${report.reservedCount === 1 ? '' : 'ken'} gereserveerd voor afwezige, vastgezette leerlingen)` : ''}.
        </li>
        <li>
          <strong>
            {s.hardSatisfied} van de {s.hardTotal}
          </strong>{' '}
          harde restricties voldaan.
        </li>
        <li>
          <strong>
            {s.softSatisfied} van de {s.softTotal}
          </strong>{' '}
          voorkeuren gerealiseerd{s.softTotal > 0 ? ` (${pct}%)` : ''}.
        </li>
        {s.softUnmet.length > 0 && (
          <li>
            {s.softUnmet.length} voorkeur{s.softUnmet.length === 1 ? '' : 'en'} kon{s.softUnmet.length === 1 ? '' : 'den'} niet worden gerealiseerd:
            <ul className="mt-1 space-y-0.5">
              {s.softUnmet.map((e) => (
                <li key={e.rule.id}>
                  <button type="button" onClick={() => openRuleDraft({ editId: e.rule.id })} className="text-left text-[13px] text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900">
                    {describeRule(e.rule, names)}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
      {(skippedAbsent > 0 || skippedInvalid.length > 0) && (
        <p className="mt-2 text-xs text-slate-500">
          {skippedAbsent > 0 && `${skippedAbsent} regel${skippedAbsent === 1 ? '' : 's'} niet toegepast omdat een leerling afwezig is. `}
          {skippedInvalid.length > 0 && `${skippedInvalid.length} ongeldige regel${skippedInvalid.length === 1 ? '' : 's'} overgeslagen.`}
        </p>
      )}
      {report.identicalToPrevious && (
        <p className="mt-2 text-xs text-amber-800">Er is geen andere geldige indeling gevonden die beter past; deze indeling is gelijk aan een eerdere.</p>
      )}
    </Card>
  );
}

export function GenerateTab() {
  const plan = useAppStore((s) => activePlan(s));
  const generating = useAppStore((s) => s.generating);
  const generate = useAppStore((s) => s.generate);
  const cancel = useAppStore((s) => s.cancel);
  const generated = useAppStore((s) => s.generated);
  const generatedIndex = useAppStore((s) => s.generatedIndex);
  const showGenerated = useAppStore((s) => s.showGenerated);
  const report = useAppStore((s) => s.lastReport);
  const update = useAppStore((s) => s.update);
  const toast = useAppStore((s) => s.toast);
  const [saveName, setSaveName] = useState<string | null>(null);

  const graph = getSeatGraph(plan.room);
  const present = plan.students.filter((s) => !s.absent);
  const availableSeats = plan.room.seats.filter((s) => !s.disabled).length;
  const activeRules = plan.rules.filter((r) => r.enabled);
  const lockedPresent = plan.arrangement.locked.length;
  const placedIds = new Set(Object.values(plan.arrangement.assignments));
  const unplaced = present.filter((s) => !placedIds.has(s.id));
  const current = summarize(getRuleEvaluations(plan));

  const capacity = useMemo(() => {
    const built = buildProblem(plan, graph);
    return precheck(built.problem).find((c) => c.kind === 'capacity');
  }, [plan, graph]);

  const settings = plan.settings;
  const setSetting = (key: keyof Plan['settings'], v: boolean) => update((d) => void (d.settings[key] = v));

  const saveArrangement = () => {
    const name = saveName?.trim() || `Indeling ${new Date().toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    update((d) => {
      d.savedArrangements.push({
        id: createId('arr'),
        name: name.slice(0, 80),
        createdAt: Date.now(),
        arrangement: JSON.parse(JSON.stringify(d.arrangement)),
      });
    });
    setSaveName(null);
    toast('success', `"${name}" is bewaard.`);
  };

  return (
    <div className="space-y-3">
      <Card title="Overzicht">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Leerlingen" value={plan.students.length} />
          <Stat label="Aanwezig" value={present.length} />
          <Stat label="Zitplaatsen" value={availableSeats} tone={present.length > availableSeats ? 'red' : undefined} />
          <Stat label="Lege zitplaatsen" value={Math.max(0, availableSeats - present.length)} />
          <Stat label="Harde restricties" value={activeRules.filter((r) => r.priority === 'hard').length} />
          <Stat label="Voorkeuren" value={activeRules.filter((r) => r.priority === 'soft').length} />
          <Stat label="Vastgezet" value={lockedPresent} />
        </div>
      </Card>

      <Card title="Instellingen">
        <div className="space-y-3">
          <Switch checked={settings.optimizePreferences} onChange={(v) => setSetting('optimizePreferences', v)} label="Voorkeuren zoveel mogelijk respecteren" />
          <Switch
            checked={settings.extraVariation}
            onChange={(v) => setSetting('extraVariation', v)}
            label="Extra variatie tussen indelingen"
            description="Leerlingen komen vaker op een andere plek en bij andere klasgenoten; voorkeuren kunnen iets minder vaak lukken."
          />
          <Switch checked={settings.keepLocked} onChange={(v) => setSetting('keepLocked', v)} label="Vastgezette leerlingen behouden" />
        </div>
      </Card>

      {capacity && (
        <Notice tone="red" icon={<TriangleAlert size={15} />}>
          {capacity.message}
        </Notice>
      )}

      <div className="space-y-2">
        <Button variant="primary" block className="h-12 text-[15px]" disabled={generating || present.length === 0} onClick={() => void generate()} icon={generating ? <LoaderCircle size={18} className="animate-spin" /> : undefined}>
          {generating ? 'Bezig met indelen…' : '✨ Genereer klassenplattegrond'}
        </Button>
        {generating && (
          <Button block size="sm" onClick={cancel} icon={<X size={15} />}>
            Annuleren
          </Button>
        )}
        {present.length === 0 && <p className="text-center text-xs text-slate-500">Voeg eerst (aanwezige) leerlingen toe.</p>}
      </div>

      {report && <ReportCard report={report} plan={plan} />}

      {(generated.length > 0 || report?.status === 'solved') && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Sparkles size={15} />} disabled={generating} onClick={() => void generate()}>
            Nieuwe indeling
          </Button>
          <Button size="sm" icon={<ArrowLeft size={15} />} disabled={generatedIndex <= 0} onClick={() => showGenerated(generatedIndex - 1)}>
            Vorige indeling
          </Button>
          <Button size="sm" icon={<ArrowRight size={15} />} disabled={generatedIndex >= generated.length - 1} onClick={() => showGenerated(generatedIndex + 1)}>
            Volgende
          </Button>
          <Button size="sm" icon={<BookmarkPlus size={15} />} onClick={() => setSaveName('')}>
            Huidige indeling bewaren
          </Button>
          {generated.length > 1 && <span className="self-center text-xs text-slate-500">Indeling {generatedIndex + 1} van {generated.length}</span>}
        </div>
      )}
      {saveName !== null && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveArrangement();
          }}
        >
          <TextInput aria-label="Naam van de indeling" placeholder="Naam, bijv. Week 42" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus maxLength={80} />
          <Button type="submit" variant="primary">
            Bewaren
          </Button>
          <IconButton label="Annuleren" onClick={() => setSaveName(null)}>
            <X size={17} />
          </IconButton>
        </form>
      )}

      <Card title="Huidige indeling">
        <div className="space-y-2 text-sm">
          {current.hardViolated.length > 0 ? (
            <Notice tone="red" icon={<TriangleAlert size={15} />}>
              Bevat overtreden restricties: {current.hardViolated.length} harde regel{current.hardViolated.length === 1 ? '' : 's'} niet voldaan.
            </Notice>
          ) : (
            <p className="text-slate-600">
              {current.hardTotal > 0 ? `Alle ${current.hardTotal} toepasbare harde restricties zijn voldaan.` : 'Geen harde restricties van toepassing.'}
              {current.softTotal > 0 && ` ${current.softSatisfied} van de ${current.softTotal} voorkeuren gerealiseerd.`}
            </p>
          )}
          {unplaced.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-medium text-slate-700">Niet geplaatst ({unplaced.length})</div>
              <ul className="flex flex-wrap gap-1">
                {unplaced.map((s) => (
                  <li
                    key={s.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(STUDENT_DRAG_TYPE, s.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="flex cursor-grab items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700"
                    title="Sleep naar een tafel"
                  >
                    <GripVertical size={12} className="text-slate-400" />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" icon={<Eraser size={15} />} onClick={() => update((d) => clearArrangement(d as Plan, true))} disabled={placedIds.size === 0}>
              Leegmaken (vastgezet blijft)
            </Button>
            <Button size="sm" icon={<LockOpen size={15} />} onClick={() => update((d) => void (d.arrangement.locked = []))} disabled={lockedPresent === 0}>
              Alles ontgrendelen
            </Button>
          </div>
        </div>
      </Card>

      {plan.savedArrangements.length > 0 && (
        <Card title={`Bewaarde indelingen (${plan.savedArrangements.length})`}>
          <ul className="space-y-1.5">
            {[...plan.savedArrangements].reverse().map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{a.name}</div>
                  <div className="text-xs text-slate-500">
                    {Object.keys(a.arrangement.assignments).length} leerlingen · {new Date(a.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() => {
                    update((d) => {
                      const seatIds = new Set(d.room.seats.map((s) => s.id));
                      const studentIds = new Set(d.students.map((s) => s.id));
                      const assignments: Record<string, string> = {};
                      for (const [seat, stu] of Object.entries(a.arrangement.assignments)) if (seatIds.has(seat) && studentIds.has(stu)) assignments[seat] = stu;
                      d.arrangement = { assignments, locked: a.arrangement.locked.filter((x) => Object.values(assignments).includes(x)) };
                    });
                    toast('info', `"${a.name}" is teruggezet. Ongedaan maken kan met Ctrl+Z.`);
                  }}
                >
                  Terugzetten
                </Button>
                <IconButton size="sm" label={`${a.name} verwijderen`} onClick={() => update((d) => void (d.savedArrangements = d.savedArrangements.filter((x) => x.id !== a.id)))}>
                  <Trash2 size={14} className="text-red-600" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
