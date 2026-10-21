import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Line, Path, Rect, Text } from 'react-konva';
import { PALETTE } from '../../models/constants';
import type { Desk, Seat, Student } from '../../models/types';
import { fitFontSize, uprightRotation } from './sceneUtils';

export type SceneMode = 'room' | 'seat' | 'export';

export interface DeskNodeProps {
  desk: Desk;
  seat?: Seat;
  student?: Student;
  groupColor: number | null;
  mode: SceneMode;
  showName: boolean;
  showNumber: boolean;
  selected: boolean;
  highlighted: boolean;
  violated: boolean;
  locked: boolean;
  /** Bij export zonder namen: groot zitplaatsnummer tonen. */
  numberOnly?: boolean;
  onDeskPointerDown?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, desk: Desk) => void;
  onDeskDblClick?: (desk: Desk) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>, desk: Desk) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, desk: Desk) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, desk: Desk) => void;
  onSeatClick?: (seat: Seat, student?: Student) => void;
  onCardDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onCardDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, student: Student, seat: Seat) => void;
}

const EMPTY_FILL = '#f6f0e6';
const EMPTY_STROKE = '#cdbfa8';
const LOCK_PATH = 'M7 11V7a5 5 0 0 1 10 0v4';

function DeskNodeImpl(p: DeskNodeProps) {
  const { desk, seat, student, mode } = p;
  const W = desk.width;
  const H = desk.height;
  const textRot = uprightRotation(desk.rotation);
  const disabled = !!seat?.disabled;
  const absent = !!student?.absent;
  const showStudent = !!student && p.showName && !p.numberOnly;
  const palette = student ? PALETTE[student.color % PALETTE.length] : null;
  const fill = disabled ? '#eceff3' : showStudent ? (absent ? '#eef0f3' : palette!.fill) : EMPTY_FILL;
  const groupStroke = p.groupColor !== null ? PALETTE[p.groupColor % PALETTE.length].stroke : EMPTY_STROKE;
  const stroke = p.selected ? '#2563eb' : p.violated ? '#dc2626' : p.highlighted ? '#2563eb' : groupStroke;
  const strokeWidth = p.selected || p.highlighted ? 3 : p.violated ? 2.5 : 1.5;
  const interactiveRoom = mode === 'room';
  const cardDraggable = mode === 'seat' && !!student;
  const name = student?.name ?? '';
  const fontSize = fitFontSize(name, W - 8);

  return (
    <Group
      id={desk.id}
      name="desk"
      x={desk.x}
      y={desk.y}
      rotation={desk.rotation}
      draggable={interactiveRoom}
      listening={mode !== 'export'}
      onMouseDown={(e) => p.onDeskPointerDown?.(e, desk)}
      onTouchStart={(e) => p.onDeskPointerDown?.(e, desk)}
      onDblClick={() => p.onDeskDblClick?.(desk)}
      onDblTap={() => p.onDeskDblClick?.(desk)}
      onDragStart={(e) => interactiveRoom && e.target === e.currentTarget && p.onDragStart?.(e, desk)}
      onDragMove={(e) => interactiveRoom && e.target === e.currentTarget && p.onDragMove?.(e, desk)}
      onDragEnd={(e) => interactiveRoom && e.target === e.currentTarget && p.onDragEnd?.(e, desk)}
      onClick={() => mode === 'seat' && seat && p.onSeatClick?.(seat, student)}
      onTap={() => mode === 'seat' && seat && p.onSeatClick?.(seat, student)}
    >
      {/* Stoel */}
      <Rect x={-17} y={H / 2 + 7} width={34} height={14} cornerRadius={4} fill="#9aa3ad" stroke="#7d8692" strokeWidth={1} />
      {/* Tafelblad */}
      <Rect
        x={-W / 2}
        y={-H / 2}
        width={W}
        height={H}
        cornerRadius={6}
        fill={EMPTY_FILL}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={disabled ? [5, 4] : undefined}
        shadowColor="#0f172a"
        shadowOpacity={p.selected ? 0.18 : 0.06}
        shadowBlur={p.selected ? 6 : 2}
        shadowOffsetY={1}
      />
      {/* Naamkaart (in plaatsingsmodus versleepbaar) */}
      <Group
        name="card"
        draggable={cardDraggable}
        onDragStart={(e) => {
          e.cancelBubble = true;
          p.onCardDragStart?.(e);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          if (student && seat) p.onCardDragEnd?.(e, student, seat);
        }}
        onMouseEnter={(e) => {
          if (cardDraggable) e.target.getStage()!.container().style.cursor = 'grab';
        }}
        onMouseLeave={(e) => {
          e.target.getStage()!.container().style.cursor = '';
        }}
      >
        <Rect
          x={-W / 2 + 3}
          y={-H / 2 + 3}
          width={W - 6}
          height={H - 6}
          cornerRadius={4}
          fill={fill}
          stroke={absent && showStudent ? '#94a3b8' : undefined}
          strokeWidth={1}
          dash={absent && showStudent ? [3, 3] : undefined}
        />
        <Group rotation={textRot}>
          {showStudent && (
            <Text
              x={-W / 2 + 4}
              y={-H / 2 + (absent ? -4 : 0)}
              width={W - 8}
              height={H}
              text={name}
              fontSize={fontSize}
              fontStyle={absent ? 'italic' : 'bold'}
              fill={absent ? '#64748b' : '#1f2937'}
              align="center"
              verticalAlign="middle"
              wrap="none"
              ellipsis
              listening={false}
            />
          )}
          {showStudent && absent && (
            <Text x={-W / 2} y={6} width={W} text="afwezig" fontSize={9} fill="#64748b" align="center" listening={false} />
          )}
          {!showStudent && !p.numberOnly && !disabled && mode !== 'export' && (
            <Text x={-W / 2} y={-H / 2} width={W} height={H} text="+" fontSize={18} fill="#c4b59c" align="center" verticalAlign="middle" listening={false} />
          )}
          {disabled && (
            <Text x={-W / 2} y={-H / 2} width={W} height={H} text={'niet\nbeschikbaar'} fontSize={9} lineHeight={1.2} fill="#64748b" align="center" verticalAlign="middle" listening={false} />
          )}
          {p.numberOnly && seat && !disabled && (
            <Text x={-W / 2} y={-H / 2} width={W} height={H} text={String(seat.number)} fontSize={18} fontStyle="bold" fill="#334155" align="center" verticalAlign="middle" listening={false} />
          )}
          {p.showNumber && seat && !p.numberOnly && (
            <Text x={-W / 2 + 5} y={-H / 2 + 4} text={String(seat.number)} fontSize={9} fill="#64748b" listening={false} />
          )}
          {p.locked && student && p.showName && !p.numberOnly && (
            <Group x={W / 2 - 15} y={-H / 2 + 4} scaleX={0.5} scaleY={0.5} listening={false}>
              <Rect x={3} y={11} width={18} height={11} cornerRadius={2} fill="#334155" />
              <Path data={LOCK_PATH} stroke="#334155" strokeWidth={2.5} lineCap="round" />
            </Group>
          )}
        </Group>
      </Group>
      {p.violated && (
        <Group rotation={textRot} listening={false}>
          <Circle x={W / 2 - 2} y={-H / 2 + 2} radius={8} fill="#dc2626" stroke="#fff" strokeWidth={1.5} />
          <Text x={W / 2 - 10} y={-H / 2 - 4} width={16} text="!" fontSize={11} fontStyle="bold" fill="#fff" align="center" />
        </Group>
      )}
      {disabled && <Line points={[-W / 2 + 6, -H / 2 + 6, W / 2 - 6, H / 2 - 6]} stroke="#cbd5e1" strokeWidth={1} listening={false} />}
    </Group>
  );
}

export const DeskNode = memo(DeskNodeImpl);
