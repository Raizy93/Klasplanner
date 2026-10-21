import type Konva from 'konva';
import { memo, useMemo } from 'react';
import { Group, Rect, Shape, Text } from 'react-konva';
import { WALL_THICKNESS } from '../../models/constants';
import type { Desk, ID, Plan, RoomObject, Seat, Side, Student } from '../../models/types';
import type { SeatGraph } from '../../services/room/seatGraph';
import { DeskNode, type SceneMode } from './DeskNode';
import { ObjectNode } from './ObjectNode';

export interface SceneHandlers {
  onDeskPointerDown?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, desk: Desk) => void;
  onDeskDblClick?: (desk: Desk) => void;
  onObjectPointerDown?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, obj: RoomObject) => void;
  onItemDragStart?: (e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => void;
  onItemDragMove?: (e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => void;
  onItemDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => void;
  onSeatClick?: (seat: Seat, student?: Student) => void;
  onCardDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onCardDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, student: Student, seat: Seat) => void;
}

export interface RoomSceneProps extends SceneHandlers {
  plan: Plan;
  graph: SeatGraph;
  mode: SceneMode;
  showNames: boolean;
  showGrid: boolean;
  showZones: boolean;
  showSeatNumbers: boolean;
  numberOnly?: boolean;
  selection?: Set<ID>;
  highlightSeatIds?: Set<ID>;
  violatedSeatIds?: Set<ID>;
}

const FLOOR = '#fbf8f3';
const WALL = '#5f6875';

function Grid({ width, height }: { width: number; height: number }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (let x = 50; x < width; x += 50) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = 50; y < height; y += 50) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.strokeShape(shape);
      }}
      stroke="#ece6dc"
      strokeWidth={1}
    />
  );
}

/** Omzetten van (diepte, lateraal) naar lokaalcoördinaten, afhankelijk van de voorkant. */
function toRoom(front: Side, depth: number, lateral: number) {
  switch (front) {
    case 'top':
      return { x: lateral, y: depth };
    case 'bottom':
      return { x: -lateral, y: -depth };
    case 'left':
      return { x: depth, y: -lateral };
    case 'right':
      return { x: -depth, y: lateral };
  }
}

function band(front: Side, d0: number, d1: number, l0: number, l1: number) {
  const a = toRoom(front, d0, l0);
  const b = toRoom(front, d1, l1);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function Zones({ graph }: { graph: SeatGraph }) {
  const b = graph.zoneBounds;
  if (!b) return null;
  const pad = 30;
  const d0 = b.depthMin - pad;
  const d1 = b.depthMax + pad;
  const l0 = b.latMin - pad;
  const l1 = b.latMax + pad;
  const dr = b.depthMax - b.depthMin;
  const lr = b.latMax - b.latMin;
  const f = graph.front;
  const parts = [
    { r: band(f, d0, b.depthMin + dr / 3, l0, l1), fill: 'rgba(37,99,235,0.07)', label: 'Vooraan' },
    { r: band(f, b.depthMax - dr / 3, d1, l0, l1), fill: 'rgba(234,88,12,0.07)', label: 'Achteraan' },
  ];
  const cols = [
    { r: band(f, d0, d1, l0, b.latMin + lr / 3), label: 'Links' },
    { r: band(f, d0, d1, b.latMin + lr / 3, b.latMax - lr / 3), label: 'Midden' },
    { r: band(f, d0, d1, b.latMax - lr / 3, l1), label: 'Rechts' },
  ];
  return (
    <Group listening={false}>
      {parts.map((p) => (
        <Group key={p.label}>
          <Rect {...p.r} fill={p.fill} />
          <Text x={p.r.x + 6} y={p.r.y + 4} text={p.label.toUpperCase()} fontSize={11} fontStyle="bold" fill="#475569" opacity={0.8} />
        </Group>
      ))}
      {lr >= 1 &&
        cols.map((c) => (
          <Group key={c.label}>
            <Rect {...c.r} stroke="#64748b" strokeWidth={1} dash={[8, 6]} opacity={0.5} />
            <Text x={c.r.x} y={c.r.y + c.r.height - 16} width={c.r.width} text={c.label} fontSize={11} fill="#475569" align="center" />
          </Group>
        ))}
    </Group>
  );
}

function FrontMarker({ front, width, height }: { front: Side; width: number; height: number }) {
  const label = 'VOORKANT';
  const t = WALL_THICKNESS;
  const common = { text: label, fontSize: 10, fontStyle: 'bold', fill: '#ffffff', letterSpacing: 2, listening: false } as const;
  switch (front) {
    case 'top':
      return <Text {...common} x={0} y={-t + 2} width={width * 0.3} align="center" />;
    case 'bottom':
      return <Text {...common} x={0} y={height + 2} width={width * 0.3} align="center" />;
    case 'left':
      return <Text {...common} x={-t + 2} y={height * 0.3} width={height * 0.3} rotation={-90} align="center" />;
    case 'right':
      return <Text {...common} x={width + t - 2} y={height * 0.0} width={height * 0.3} rotation={90} align="center" />;
  }
}

function RoomSceneImpl(p: RoomSceneProps) {
  const { plan, graph, mode } = p;
  const room = plan.room;
  const seatByDesk = useMemo(() => new Map(room.seats.map((s) => [s.deskId, s])), [room.seats]);
  const studentById = useMemo(() => new Map(plan.students.map((s) => [s.id, s])), [plan.students]);
  const groupColor = useMemo(() => new Map(room.groups.map((g) => [g.id, g.color])), [room.groups]);
  const locked = useMemo(() => new Set(plan.arrangement.locked), [plan.arrangement.locked]);
  const assignments = plan.arrangement.assignments;
  const t = WALL_THICKNESS;

  return (
    <Group>
      {/* Muren en vloer */}
      <Rect x={-t} y={-t} width={room.width + 2 * t} height={room.height + 2 * t} fill={WALL} cornerRadius={3} listening={false} />
      <Rect name="floor" x={0} y={0} width={room.width} height={room.height} fill={FLOOR} />
      {p.showGrid && mode !== 'export' && <Grid width={room.width} height={room.height} />}
      <FrontMarker front={graph.front} width={room.width} height={room.height} />
      {p.showZones && mode !== 'export' && <Zones graph={graph} />}
      {room.objects.map((o) => (
        <ObjectNode
          key={o.id}
          obj={o}
          mode={mode}
          selected={!!p.selection?.has(o.id)}
          onPointerDown={p.onObjectPointerDown}
          onDragStart={p.onItemDragStart}
          onDragMove={p.onItemDragMove}
          onDragEnd={p.onItemDragEnd}
        />
      ))}
      {room.desks.map((d) => {
        const seat = seatByDesk.get(d.id);
        const studentId = seat ? assignments[seat.id] : undefined;
        const student = studentId ? studentById.get(studentId) : undefined;
        return (
          <DeskNode
            key={d.id}
            desk={d}
            seat={seat}
            student={student}
            groupColor={d.groupId ? (groupColor.get(d.groupId) ?? null) : null}
            mode={mode}
            showName={p.showNames}
            showNumber={p.showSeatNumbers}
            numberOnly={p.numberOnly}
            selected={!!p.selection?.has(d.id)}
            highlighted={!!seat && !!p.highlightSeatIds?.has(seat.id)}
            violated={!!seat && !!p.violatedSeatIds?.has(seat.id)}
            locked={!!student && locked.has(student.id)}
            onDeskPointerDown={p.onDeskPointerDown}
            onDeskDblClick={p.onDeskDblClick}
            onDragStart={p.onItemDragStart}
            onDragMove={p.onItemDragMove}
            onDragEnd={p.onItemDragEnd}
            onSeatClick={p.onSeatClick}
            onCardDragStart={p.onCardDragStart}
            onCardDragEnd={p.onCardDragEnd}
          />
        );
      })}
    </Group>
  );
}

export const RoomScene = memo(RoomSceneImpl);
