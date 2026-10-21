import type Konva from 'konva';
import { memo } from 'react';
import { Arc, Circle, Group, Line, Rect, Text } from 'react-konva';
import type { RoomObject } from '../../models/types';
import { uprightRotation } from './sceneUtils';
import type { SceneMode } from './DeskNode';

export interface ObjectNodeProps {
  obj: RoomObject;
  mode: SceneMode;
  selected: boolean;
  onPointerDown?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, obj: RoomObject) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>, obj: RoomObject) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, obj: RoomObject) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, obj: RoomObject) => void;
}

const FLOOR = '#fbf8f3';

function Label({ obj, color, size = 12 }: { obj: RoomObject; color: string; size?: number }) {
  const rot = uprightRotation(obj.rotation);
  const along = obj.height > obj.width * 1.5;
  return (
    <Group rotation={rot + (along ? -90 : 0)} listening={false}>
      <Text
        x={along ? -obj.height / 2 : -obj.width / 2}
        y={along ? -obj.width / 2 : -obj.height / 2}
        width={along ? obj.height : obj.width}
        height={along ? obj.width : obj.height}
        text={obj.label ?? ''}
        fontSize={size}
        fontStyle="bold"
        fill={color}
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
      />
    </Group>
  );
}

function ObjectShape({ obj }: { obj: RoomObject }) {
  const { width: w, height: h } = obj;
  const x = -w / 2;
  const y = -h / 2;
  switch (obj.type) {
    case 'whiteboard':
      return (
        <>
          <Rect x={x} y={y} width={w} height={h} cornerRadius={3} fill="#475569" stroke="#334155" strokeWidth={1.5} />
          <Rect x={x + 4} y={y + 3} width={w - 8} height={Math.max(2, h - 6)} cornerRadius={2} fill="#5b6b80" />
          <Label obj={obj} color="#ffffff" size={Math.min(13, Math.max(9, h - 4))} />
        </>
      );
    case 'teacherDesk':
      return (
        <>
          <Rect x={-18} y={y - 18} width={36} height={14} cornerRadius={4} fill="#9aa3ad" stroke="#7d8692" strokeWidth={1} />
          <Rect x={x} y={y} width={w} height={h} cornerRadius={4} fill="#e9cfa6" stroke="#b78f5c" strokeWidth={1.5} />
          <Label obj={obj} color="#5b4326" />
        </>
      );
    case 'cabinet':
      return (
        <>
          <Rect x={x} y={y} width={w} height={h} cornerRadius={3} fill="#e3c79c" stroke="#a9845a" strokeWidth={1.5} />
          {[1, 2, 3].map((i) => (
            <Line key={i} points={[x + (w * i) / 4, y + 3, x + (w * i) / 4, y + h - 3]} stroke="#b9956a" strokeWidth={1} />
          ))}
          <Label obj={obj} color="#5b4326" size={11} />
        </>
      );
    case 'window':
      return (
        <>
          <Rect x={x} y={y} width={w} height={h} fill="#dcecf8" stroke="#7fa9c9" strokeWidth={1.5} />
          <Line points={[x + 2, 0, x + w - 2, 0]} stroke="#7fa9c9" strokeWidth={1} />
        </>
      );
    case 'door':
      return (
        <>
          <Rect x={x} y={y} width={w} height={h} fill={FLOOR} />
          <Line points={[x, y + h / 2, x, y + h / 2 + w]} stroke="#64748b" strokeWidth={2} />
          <Arc x={x} y={y + h / 2} innerRadius={w} outerRadius={w} angle={90} stroke="#94a3b8" strokeWidth={1.2} dash={[4, 4]} />
        </>
      );
    case 'plant':
      return (
        <>
          <Circle radius={w / 2} fill="#c08a5a" opacity={0.25} />
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} x={Math.cos((a * Math.PI) / 180) * w * 0.22} y={Math.sin((a * Math.PI) / 180) * w * 0.22} radius={w * 0.22} fill="#6aa86f" stroke="#4d8a53" strokeWidth={1} />
          ))}
          <Circle radius={w * 0.12} fill="#4d8a53" />
        </>
      );
  }
}

function ObjectNodeImpl({ obj, mode, selected, onPointerDown, onDragStart, onDragMove, onDragEnd }: ObjectNodeProps) {
  const editable = mode === 'room';
  return (
    <Group
      id={obj.id}
      name="object"
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={editable}
      listening={editable}
      onMouseDown={(e) => onPointerDown?.(e, obj)}
      onTouchStart={(e) => onPointerDown?.(e, obj)}
      onDragStart={(e) => e.target === e.currentTarget && onDragStart?.(e, obj)}
      onDragMove={(e) => e.target === e.currentTarget && onDragMove?.(e, obj)}
      onDragEnd={(e) => e.target === e.currentTarget && onDragEnd?.(e, obj)}
    >
      {/* Onzichtbaar vlak voor betrouwbare selectie van dunne objecten. */}
      <Rect x={-obj.width / 2 - 4} y={-obj.height / 2 - 4} width={obj.width + 8} height={obj.height + 8} fill="transparent" />
      <ObjectShape obj={obj} />
      {selected && (
        <Rect
          x={-obj.width / 2 - 3}
          y={-obj.height / 2 - 3}
          width={obj.width + 6}
          height={obj.height + 6}
          stroke="#2563eb"
          strokeWidth={2}
          dash={[6, 3]}
          listening={false}
        />
      )}
    </Group>
  );
}

export const ObjectNode = memo(ObjectNodeImpl);
