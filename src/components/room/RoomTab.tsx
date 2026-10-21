import {
  Armchair,
  Copy,
  Link2,
  ListOrdered,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  TriangleAlert,
  Unlink2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { OBJECT_DEFAULTS, OBJECT_TYPE_LABELS, PALETTE } from '../../models/constants';
import type { FrontSetting, ID, Plan, RoomObjectType } from '../../models/types';
import { removeDesksFromPlan } from '../../services/plan/planOps';
import {
  addDesk,
  addGroupFromTemplate,
  addObject,
  applyPlacements,
  dissolveGroup,
  duplicateItems,
  findFreeSpot,
  groupDesks,
  GROUP_TEMPLATES,
  removeObjects,
  renumberSeats,
  rotateItems,
  ungroupDesks,
} from '../../services/room/roomOps';
import { RELATION_LABELS } from '../../services/room/relations';
import { depthAndLateral, frontRotation, resolveFront, SIDE_LABELS } from '../../services/room/zones';
import { activePlan, useAppStore } from '../../store/appStore';
import { getSeatGraph } from '../../store/selectors';
import { Button, IconButton } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Card, Field, Notice, NumberField, Select, Switch, TextInput } from '../ui/primitives';

function AddGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const update = useAppStore((s) => s.update);
  const setSelection = useAppStore((s) => s.setSelection);
  const [custom, setCustom] = useState({ front: 3, back: 3, facing: true, twoRows: true });

  const place = (template: { rows: number[]; facing: boolean }) => {
    let newIds: ID[] = [];
    update((d) => {
      const spot = findFreeSpot(d.room as Plan['room'], 160, 140);
      const g = addGroupFromTemplate(d.room as Plan['room'], template, spot, frontRotation(resolveFront(d.room as Plan['room'])));
      newIds = d.room.desks.filter((x) => x.groupId === g.id).map((x) => x.id);
    });
    setSelection(newIds);
    onClose();
  };

  return (
    <Dialog open={open} title="Tafelgroep toevoegen" onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => place(GROUP_TEMPLATES[n])}
              className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 px-2 py-3 text-sm font-medium text-slate-800 hover:border-blue-400 hover:bg-blue-50"
            >
              <GroupPreview rows={GROUP_TEMPLATES[n].rows} />
              Groepje van {n}
            </button>
          ))}
        </div>
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Eigen samenstelling</legend>
          <Switch checked={custom.twoRows} onChange={(v) => setCustom({ ...custom, twoRows: v })} label="Twee rijen" />
          <div className="flex gap-2">
            {custom.twoRows && <NumberField label="Tafels voorste rij" value={custom.front} min={1} max={10} onChange={(v) => setCustom({ ...custom, front: Math.max(1, Math.min(10, Math.round(v))) })} />}
            <NumberField label={custom.twoRows ? 'Tafels achterste rij' : 'Aantal tafels'} value={custom.back} min={1} max={10} onChange={(v) => setCustom({ ...custom, back: Math.max(1, Math.min(10, Math.round(v))) })} />
          </div>
          {custom.twoRows && (
            <Switch
              checked={custom.facing}
              onChange={(v) => setCustom({ ...custom, facing: v })}
              label="Rijen tegenover elkaar"
              description="Uit: beide rijen kijken naar de voorkant (achter elkaar)."
            />
          )}
          <Button
            variant="primary"
            block
            onClick={() => place({ rows: custom.twoRows ? [custom.front, custom.back] : [custom.back], facing: custom.twoRows && custom.facing })}
          >
            Plaatsen ({custom.twoRows ? custom.front + custom.back : custom.back} tafels)
          </Button>
        </fieldset>
      </div>
    </Dialog>
  );
}

function GroupPreview({ rows }: { rows: number[] }) {
  return (
    <svg width="48" height="30" viewBox="0 0 48 30" aria-hidden>
      {rows.map((n, r) =>
        Array.from({ length: n }, (_, i) => (
          <rect key={`${r}-${i}`} x={4 + i * 13} y={rows.length === 1 ? 9 : 2 + r * 13} width={12} height={12} rx={2} fill="#e2e8f0" stroke="#64748b" />
        )),
      )}
    </svg>
  );
}

function Inspector({ plan, selection }: { plan: Plan; selection: ID[] }) {
  const update = useAppStore((s) => s.update);
  const setSelection = useAppStore((s) => s.setSelection);
  const graph = getSeatGraph(plan.room);
  const desks = plan.room.desks.filter((d) => selection.includes(d.id));
  const objects = plan.room.objects.filter((o) => selection.includes(o.id));
  const single = selection.length === 1;
  const desk = single ? desks[0] : undefined;
  const obj = single ? objects[0] : undefined;
  const groupIds = [...new Set(desks.map((d) => d.groupId).filter(Boolean))] as ID[];
  const wholeGroup =
    groupIds.length === 1 && desks.length === plan.room.desks.filter((d) => d.groupId === groupIds[0]).length && objects.length === 0
      ? plan.room.groups.find((g) => g.id === groupIds[0])
      : undefined;
  const anyGrouped = desks.some((d) => d.groupId);
  const seat = desk ? plan.room.seats.find((s) => s.deskId === desk.id) : undefined;

  const setPlacement = (id: ID, patch: Partial<{ x: number; y: number; rotation: number; width: number; height: number }>, key: string) => {
    const it = plan.room.desks.find((d) => d.id === id) ?? plan.room.objects.find((o) => o.id === id);
    if (!it) return;
    update((d) => applyPlacements(d.room as Plan['room'], [{ id, x: it.x, y: it.y, rotation: it.rotation, ...patch }]), { coalesceKey: `${key}:${id}` });
  };

  const relations = useMemo(() => {
    if (!seat) return null;
    const idx = graph.index.get(seat.id);
    if (idx === undefined) return null;
    const num = (i: number) => graph.seats[i].number;
    return {
      beside: graph.beside[idx].map(num),
      opposite: graph.opposite[idx].map(num),
      ambiguous: graph.ambiguous.filter(([a, b]) => a === idx || b === idx).map(([a, b]) => num(a === idx ? b : a)),
    };
  }, [seat, graph]);

  const title = desk ? `Tafel – zitplaats ${seat?.number ?? '?'}` : obj ? OBJECT_TYPE_LABELS[obj.type] : wholeGroup ? wholeGroup.name : `${selection.length} objecten`;

  return (
    <Card title={`Selectie: ${title}`}>
      <div className="space-y-3">
        {(desk || obj) && (
          <div className="flex gap-2">
            <NumberField label="X" suffix="cm" value={(desk ?? obj)!.x} onChange={(v) => setPlacement((desk ?? obj)!.id, { x: v }, 'x')} />
            <NumberField label="Y" suffix="cm" value={(desk ?? obj)!.y} onChange={(v) => setPlacement((desk ?? obj)!.id, { y: v }, 'y')} />
            <NumberField label="Rotatie" suffix="°" step={15} value={(desk ?? obj)!.rotation} onChange={(v) => setPlacement((desk ?? obj)!.id, { rotation: v }, 'r')} />
          </div>
        )}
        {obj && (
          <>
            <div className="flex gap-2">
              <NumberField label="Breedte" suffix="cm" min={5} value={obj.width} onChange={(v) => setPlacement(obj.id, { width: Math.max(5, v) }, 'w')} />
              <NumberField label="Diepte" suffix="cm" min={5} value={obj.height} onChange={(v) => setPlacement(obj.id, { height: Math.max(5, v) }, 'h')} />
            </div>
            {obj.type !== 'window' && obj.type !== 'door' && obj.type !== 'plant' && (
              <Field label="Label" htmlFor="obj-label">
                <TextInput
                  id="obj-label"
                  value={obj.label ?? ''}
                  maxLength={40}
                  onChange={(e) =>
                    update((d) => void (d.room.objects.find((o) => o.id === obj.id)!.label = e.target.value), { coalesceKey: `label:${obj.id}` })
                  }
                />
              </Field>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => update((d) => rotateItems(d.room as Plan['room'], selection, -90))} title="90° tegen de klok in draaien">
            90°
          </Button>
          <Button size="sm" icon={<RotateCw size={15} />} onClick={() => update((d) => rotateItems(d.room as Plan['room'], selection, 90))} title="90° met de klok mee draaien (R)">
            90°
          </Button>
          <Button size="sm" icon={<RotateCw size={15} />} onClick={() => update((d) => rotateItems(d.room as Plan['room'], selection, 15))} title="15° draaien">
            15°
          </Button>
          <Button
            size="sm"
            icon={<Copy size={15} />}
            onClick={() => {
              let ids: ID[] = [];
              update((d) => void (ids = duplicateItems(d.room as Plan['room'], selection)));
              setSelection(ids);
            }}
            title="Dupliceren (Ctrl+D)"
          >
            Dupliceren
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={15} />}
            onClick={() =>
              update((d) => {
                removeDesksFromPlan(d as Plan, desks.map((x) => x.id));
                removeObjects(d.room as Plan['room'], objects.map((o) => o.id));
              })
            }
            title="Verwijderen (Delete)"
          >
            Verwijderen
          </Button>
        </div>

        {desks.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="text-[13px] font-medium text-slate-700">Tafelgroep</div>
            {desk && <p className="text-sm text-slate-600">{desk.groupId ? `Onderdeel van ${plan.room.groups.find((g) => g.id === desk.groupId)?.name}.` : 'Losse tafel (geen groep).'}</p>}
            <div className="flex flex-wrap gap-1.5">
              {desks.length >= 2 && !wholeGroup && (
                <Button size="sm" variant="primary" icon={<Link2 size={15} />} onClick={() => update((d) => void groupDesks(d.room as Plan['room'], desks.map((x) => x.id)))} title="Koppelen tot één groep (Ctrl+G)">
                  Koppelen tot groep
                </Button>
              )}
              {anyGrouped && !wholeGroup && (
                <Button size="sm" icon={<Unlink2 size={15} />} onClick={() => update((d) => ungroupDesks(d.room as Plan['room'], desks.map((x) => x.id)))}>
                  Losmaken uit groep
                </Button>
              )}
              {wholeGroup && (
                <Button size="sm" icon={<Unlink2 size={15} />} onClick={() => update((d) => dissolveGroup(d.room as Plan['room'], wholeGroup.id))}>
                  Groep opheffen
                </Button>
              )}
            </div>
            {wholeGroup && <p className="text-xs text-slate-500">Tip: dubbelklik op een tafel om alleen die tafel te selecteren.</p>}
          </div>
        )}

        {desk && seat && (
          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
            <Switch
              checked={seat.disabled}
              onChange={(v) => update((d) => void (d.room.seats.find((s) => s.id === seat.id)!.disabled = v))}
              label="Zitplaats niet beschikbaar"
              description="De generator plaatst hier niemand."
            />
            {relations && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-slate-500">Naast</dt>
                <dd>{relations.beside.length ? relations.beside.map((n) => `zitplaats ${n}`).join(', ') : '–'}</dd>
                <dt className="text-slate-500">Tegenover</dt>
                <dd>{relations.opposite.length ? relations.opposite.map((n) => `zitplaats ${n}`).join(', ') : '–'}</dd>
              </dl>
            )}
            {relations && relations.ambiguous.length > 0 && (
              <Notice tone="amber" icon={<TriangleAlert size={15} />}>
                De relatie met zitplaats {relations.ambiguous.join(', ')} is niet eenduidig (bijv. schuin of half verschoven). Die plaatsen tellen niet als
                "naast" of "tegenover". Lijn de tafels recht uit om dit op te lossen.
              </Notice>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function GroupsCard({ plan }: { plan: Plan }) {
  const update = useAppStore((s) => s.update);
  const setSelection = useAppStore((s) => s.setSelection);
  if (plan.room.groups.length === 0) return null;
  return (
    <Card title={`Tafelgroepen (${plan.room.groups.length})`}>
      <ul className="space-y-1.5">
        {plan.room.groups.map((g) => {
          const members = plan.room.desks.filter((d) => d.groupId === g.id);
          const amb = g.relations.filter((r) => r.kind === 'ambiguous').length;
          return (
            <li key={g.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
              <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: PALETTE[g.color % PALETTE.length].fill, border: `1px solid ${PALETTE[g.color % PALETTE.length].stroke}` }} aria-hidden />
              <input
                aria-label="Groepsnaam"
                value={g.name}
                maxLength={40}
                onChange={(e) => update((d) => void (d.room.groups.find((x) => x.id === g.id)!.name = e.target.value), { coalesceKey: `gname:${g.id}` })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-blue-400 focus:outline-none"
              />
              <span className="text-xs text-slate-500">{members.length} tafels</span>
              {amb > 0 && (
                <span title={`${amb} niet-eenduidige relatie(s)`} className="text-amber-600">
                  <TriangleAlert size={15} aria-label={`${amb} niet-eenduidige relaties`} />
                </span>
              )}
              <IconButton size="sm" label={`${g.name} selecteren`} onClick={() => setSelection(members.map((m) => m.id))}>
                <Users size={15} />
              </IconButton>
              <IconButton size="sm" label={`${g.name} opheffen (tafels blijven staan)`} onClick={() => update((d) => dissolveGroup(d.room as Plan['room'], g.id))}>
                <Unlink2 size={15} />
              </IconButton>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Relaties binnen een groep: {Object.values(RELATION_LABELS).slice(0, 2).join(' en ')} worden automatisch bepaald en vastgelegd zodra je tafels koppelt.
        Tafels die alleen tegen elkaar staan maar niet gekoppeld zijn, vormen geen groepje.
      </p>
    </Card>
  );
}

const OBJECT_BUTTONS: RoomObjectType[] = ['whiteboard', 'teacherDesk', 'door', 'window', 'cabinet', 'plant'];

export function RoomTab() {
  const plan = useAppStore((s) => activePlan(s));
  const selection = useAppStore((s) => s.selection);
  const setSelection = useAppStore((s) => s.setSelection);
  const update = useAppStore((s) => s.update);
  const showGrid = useAppStore((s) => s.showGrid);
  const snapToGrid = useAppStore((s) => s.snapToGrid);
  const showSeatNumbers = useAppStore((s) => s.showSeatNumbers);
  const toggle = useAppStore((s) => s.toggle);
  const requestFit = useAppStore((s) => s.requestFit);
  const [groupOpen, setGroupOpen] = useState(false);
  const graph = getSeatGraph(plan.room);
  const room = plan.room;

  const addLoose = () => {
    let id = '';
    update((d) => {
      const spot = findFreeSpot(d.room as Plan['room'], 70, 50);
      id = addDesk(d.room as Plan['room'], spot.x, spot.y, frontRotation(graph.front)).id;
    });
    setSelection([id]);
  };

  const addObj = (type: RoomObjectType) => {
    let id = '';
    update((d) => {
      const def = OBJECT_DEFAULTS[type];
      const spot = findFreeSpot(d.room as Plan['room'], def.width, def.height);
      id = addObject(d.room as Plan['room'], type, spot.x, spot.y).id;
    });
    setSelection([id]);
  };

  const renumber = () => {
    const order = graph.seats
      .map((s) => ({ id: s.seatId, ...depthAndLateral(s.pos, graph.front) }))
      .sort((a, b) => Math.round(a.depth / 25) - Math.round(b.depth / 25) || a.lateral - b.lateral)
      .map((s) => s.id);
    update((d) => renumberSeats(d.room as Plan['room'], order));
  };

  return (
    <div className="space-y-3">
      <Card title="Toevoegen">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon={<Plus size={16} />} onClick={addLoose}>
            Losse tafel
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setGroupOpen(true)}>
            Tafelgroep
          </Button>
        </div>
        <div className="mt-3 text-[13px] font-medium text-slate-700">Objecten</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {OBJECT_BUTTONS.map((t) => (
            <Button key={t} size="sm" icon={<Plus size={14} />} onClick={() => addObj(t)}>
              {OBJECT_TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Klik op een groepje om het geheel te selecteren, dubbelklik voor één tafel. Shift+klik of een kader slepen selecteert meerdere objecten.
          Pijltjestoetsen verschuiven, R draait, Delete verwijdert.
        </p>
      </Card>

      {selection.length > 0 ? (
        <Inspector plan={plan} selection={selection} />
      ) : (
        <Card>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Armchair size={16} /> Selecteer een tafel of object op de plattegrond om het te bewerken.
          </p>
        </Card>
      )}

      <GroupsCard plan={plan} />

      <Card title="Lokaal">
        <div className="space-y-3">
          <div className="flex gap-2">
            <NumberField label="Breedte" suffix="cm" step={10} min={200} max={3000} value={room.width} onChange={(v) => update((d) => void (d.room.width = Math.max(200, Math.min(3000, v))), { coalesceKey: 'roomw' })} />
            <NumberField label="Diepte" suffix="cm" step={10} min={200} max={3000} value={room.height} onChange={(v) => update((d) => void (d.room.height = Math.max(200, Math.min(3000, v))), { coalesceKey: 'roomh' })} />
          </div>
          <Field label="Voorkant van het lokaal" htmlFor="front" hint={`Huidige voorkant: ${SIDE_LABELS[graph.front].toLowerCase()}. Bepaalt wat "vooraan", "achteraan", "links" en "rechts" betekenen.`}>
            <Select id="front" value={room.front} onChange={(e) => update((d) => void (d.room.front = e.target.value as FrontSetting))}>
              <option value="auto">Automatisch (wand bij het digibord)</option>
              <option value="top">Boven</option>
              <option value="bottom">Onder</option>
              <option value="left">Links</option>
              <option value="right">Rechts</option>
            </Select>
          </Field>
          <div className="space-y-2">
            <Switch checked={showGrid} onChange={() => toggle('showGrid')} label="Raster tonen" />
            <Switch checked={snapToGrid} onChange={() => toggle('snapToGrid')} label="Uitlijnen op raster" description="Tafels lijnen ook automatisch uit tegen andere tafels (Alt = tijdelijk uit)." />
            <Switch checked={showSeatNumbers} onChange={() => toggle('showSeatNumbers')} label="Zitplaatsnummers tonen bij het indelen" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={<ListOrdered size={15} />} onClick={renumber} disabled={room.seats.length === 0}>
              Zitplaatsen hernummeren
            </Button>
            <Button size="sm" onClick={requestFit}>
              Passend maken
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {room.desks.length} tafels · {room.seats.filter((s) => !s.disabled).length} beschikbare zitplaatsen · {room.groups.length} groepen
          </p>
        </div>
      </Card>
      <AddGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
    </div>
  );
}
