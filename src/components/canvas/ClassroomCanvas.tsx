import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rect, Stage, Transformer } from 'react-konva';
import { GRID_SIZE } from '../../models/constants';
import type { Desk, ID, RoomObject, Seat, Student } from '../../models/types';
import { applyPlacements, moveItems } from '../../services/room/roomOps';
import { needsSecondStudent } from '../../services/rules/ruleMeta';
import { activePlan, useAppStore } from '../../store/appStore';
import { placeStudent } from '../../store/seatActions';
import { getRuleEvaluations, getSeatGraph } from '../../store/selectors';
import { angleDiff, clamp, rotate, snap, type Point } from '../../utils/geometry';
import { RoomScene } from './RoomScene';
import { deskAtPoint, fitView } from './sceneUtils';
import { CanvasOverlays } from './CanvasOverlays';
import { canvasApi, STUDENT_DRAG_TYPE } from './canvasApi';

interface DragState {
  primary: ID;
  start: Map<ID, Point>;
  delta: Point;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

export function ClassroomCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; center: Point } | null>(null);
  const fittedNonce = useRef(-1);

  const plan = useAppStore((s) => activePlan(s));
  const activeTab = useAppStore((s) => s.activeTab);
  const view = useAppStore((s) => s.view);
  const fitNonce = useAppStore((s) => s.fitNonce);
  const selection = useAppStore((s) => s.selection);
  const selectedStudentId = useAppStore((s) => s.selectedStudentId);
  const selectedSeatId = useAppStore((s) => s.selectedSeatId);
  const showGrid = useAppStore((s) => s.showGrid);
  const snapToGrid = useAppStore((s) => s.snapToGrid);
  const showZones = useAppStore((s) => s.showZones);
  const showSeatNumbers = useAppStore((s) => s.showSeatNumbers);
  const setView = useAppStore((s) => s.setView);
  const setSelection = useAppStore((s) => s.setSelection);
  const update = useAppStore((s) => s.update);

  const mode = activeTab === 'room' ? 'room' : 'seat';
  const room = plan.room;
  const graph = getSeatGraph(room);
  const selectionSet = useMemo(() => new Set(selection), [selection]);

  // ---- afmetingen en passend maken ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Direct meten: ResizeObserver vuurt soms pas later (bijv. in een verborgen tabblad of iframe).
    const rect = el.getBoundingClientRect();
    setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.width < 10 || size.height < 10) return;
    if (fittedNonce.current === fitNonce) return;
    fittedNonce.current = fitNonce;
    setView(fitView(room, size.width, size.height));
  }, [fitNonce, size, room, setView]);

  // ---- markeringen ----
  const seatOfStudent = useMemo(() => {
    const m = new Map<ID, ID>();
    for (const [seatId, sid] of Object.entries(plan.arrangement.assignments)) m.set(sid, seatId);
    return m;
  }, [plan.arrangement.assignments]);

  const highlightSeatIds = useMemo(() => {
    const s = new Set<ID>();
    if (mode !== 'seat') return s;
    if (selectedSeatId) s.add(selectedSeatId);
    if (selectedStudentId) {
      const seat = seatOfStudent.get(selectedStudentId);
      if (seat) s.add(seat);
    }
    return s;
  }, [mode, selectedSeatId, selectedStudentId, seatOfStudent]);

  const violatedSeatIds = useMemo(() => {
    const s = new Set<ID>();
    for (const e of getRuleEvaluations(plan)) {
      if (e.status !== 'violated' || e.rule.priority !== 'hard') continue;
      const a = seatOfStudent.get(e.rule.studentA);
      if (a) s.add(a);
      if (needsSecondStudent(e.rule.type) && e.rule.studentB) {
        const b = seatOfStudent.get(e.rule.studentB);
        if (b) s.add(b);
      }
    }
    return s;
  }, [plan, seatOfStudent]);

  // ---- vangnet: tekening altijd gelijk aan de opgeslagen gegevens ----
  // react-konva past alleen gewijzigde props toe. Is een node ooit visueel verschoven zonder dat de
  // gegevens veranderden (bijv. een afgebroken sleepactie), dan herstelt dit effect de juiste positie.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || dragRef.current) return;
    for (const it of [...room.desks, ...room.objects]) {
      const node = stage.findOne(`#${it.id}`);
      if (!node) continue;
      if (node.x() !== it.x || node.y() !== it.y || node.rotation() !== it.rotation || node.scaleX() !== 1 || node.scaleY() !== 1) {
        node.setAttrs({ x: it.x, y: it.y, rotation: it.rotation, scaleX: 1, scaleY: 1 });
      }
    }
    stage.batchDraw();
  }, [room]);

  // ---- transformer (draaien / schalen) ----
  const attachTransformer = useCallback(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const sel = useAppStore.getState().selection;
    if (mode !== 'room') {
      tr.nodes([]);
      return;
    }
    const nodes = sel.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    const singleObject = sel.length === 1 && room.objects.some((o) => o.id === sel[0]);
    tr.resizeEnabled(singleObject);
    tr.visible(true);
    tr.getLayer()?.batchDraw();
  }, [mode, room]);

  useEffect(() => {
    attachTransformer();
  }, [selection, attachTransformer]);

  const onTransformEnd = useCallback(() => {
    const tr = trRef.current;
    if (!tr) return;
    const placements = tr.nodes().map((n) => {
      const obj = room.objects.find((o) => o.id === n.id());
      const p = {
        id: n.id(),
        x: Math.round(n.x() * 10) / 10,
        y: Math.round(n.y() * 10) / 10,
        rotation: Math.round(n.rotation() * 10) / 10,
        width: obj ? Math.round(obj.width * n.scaleX()) : undefined,
        height: obj ? Math.round(obj.height * n.scaleY()) : undefined,
      };
      n.scaleX(1);
      n.scaleY(1);
      return p;
    });
    update((d) => applyPlacements(d.room, placements));
  }, [room.objects, update]);

  // ---- selectie in lokaalmodus ----
  const groupDeskIds = useCallback((groupId: ID) => room.desks.filter((d) => d.groupId === groupId).map((d) => d.id), [room.desks]);

  const selectItems = useCallback(
    (ids: ID[], additive: boolean, anchor: ID) => {
      const current = useAppStore.getState().selection;
      if (additive) {
        const allIn = ids.every((id) => current.includes(id));
        setSelection(allIn ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
      } else if (!current.includes(anchor)) {
        setSelection(ids);
      }
    },
    [setSelection],
  );

  const onDeskPointerDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, desk: Desk) => {
      if (mode !== 'room') return;
      if ('button' in e.evt && e.evt.button !== 0) return;
      e.cancelBubble = true;
      const ids = desk.groupId ? groupDeskIds(desk.groupId) : [desk.id];
      selectItems(ids, e.evt.shiftKey, desk.id);
    },
    [mode, groupDeskIds, selectItems],
  );

  const onDeskDblClick = useCallback(
    (desk: Desk) => {
      if (mode === 'room') setSelection([desk.id]);
    },
    [mode, setSelection],
  );

  const onObjectPointerDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, obj: RoomObject) => {
      if (mode !== 'room') return;
      if ('button' in e.evt && e.evt.button !== 0) return;
      e.cancelBubble = true;
      selectItems([obj.id], e.evt.shiftKey, obj.id);
    },
    [mode, selectItems],
  );

  // ---- slepen van tafels/objecten (meerdere tegelijk, met uitlijnen) ----
  const positionOf = useCallback(
    (id: ID): Point | null => {
      const d = room.desks.find((x) => x.id === id);
      if (d) return { x: d.x, y: d.y };
      const o = room.objects.find((x) => x.id === id);
      return o ? { x: o.x, y: o.y } : null;
    },
    [room],
  );

  const onItemDragStart = useCallback(
    (_e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => {
      // Er loopt al een sleepactie (andere geselecteerde items bewegen mee): niets doen.
      if (dragRef.current) return;
      // Koppel de transformer los: die zou anders zelf de andere geselecteerde nodes meeslepen,
      // waardoor er twee sleepmechanismen tegelijk actief zijn.
      trRef.current?.nodes([]);
      let ids = useAppStore.getState().selection;
      if (!ids.includes(item.id)) {
        ids = [item.id];
        setSelection(ids);
      }
      const start = new Map<ID, Point>();
      ids.forEach((id) => {
        const p = positionOf(id);
        if (p) start.set(id, p);
      });
      dragRef.current = { primary: item.id, start, delta: { x: 0, y: 0 } };
    },
    [positionOf, setSelection],
  );

  /** Lijnt geselecteerde tafels uit tegen niet-geselecteerde tafels (zij-aan-zij of tegenover). */
  const edgeSnap = useCallback(
    (delta: Point, start: Map<ID, Point>): Point | null => {
      const moving = room.desks.filter((d) => start.has(d.id)).slice(0, 12);
      if (moving.length === 0) return null;
      const others = room.desks.filter((d) => !start.has(d.id));
      let best: Point | null = null;
      let bestLen = 12;
      for (const d of moving) {
        const p0 = start.get(d.id)!;
        const pos = { x: p0.x + delta.x, y: p0.y + delta.y };
        for (const o of others) {
          const diff = Math.abs(angleDiff(d.rotation, o.rotation));
          if (!(diff < 3 || diff > 177)) continue;
          if (Math.abs(pos.x - o.x) > 150 || Math.abs(pos.y - o.y) > 150) continue;
          const v = rotate({ x: pos.x - o.x, y: pos.y - o.y }, -o.rotation);
          const W = (d.width + o.width) / 2;
          const H = (d.height + o.height) / 2;
          for (const t of [
            { x: W, y: 0 },
            { x: -W, y: 0 },
            { x: 0, y: H },
            { x: 0, y: -H },
            { x: W, y: H },
            { x: -W, y: H },
            { x: W, y: -H },
            { x: -W, y: -H },
          ]) {
            const cx = t.x - v.x;
            const cy = t.y - v.y;
            const len = Math.hypot(cx, cy);
            if (len < bestLen) {
              bestLen = len;
              best = rotate({ x: cx, y: cy }, o.rotation);
            }
          }
        }
      }
      return best ? { x: delta.x + best.x, y: delta.y + best.y } : null;
    },
    [room.desks],
  );

  const onItemDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => {
      const ds = dragRef.current;
      if (!ds || ds.primary !== item.id) return;
      const p0 = ds.start.get(item.id)!;
      let delta = { x: e.target.x() - p0.x, y: e.target.y() - p0.y };
      if (snapToGrid) delta = { x: snap(delta.x, GRID_SIZE), y: snap(delta.y, GRID_SIZE) };
      const raw = { x: e.target.x() - p0.x, y: e.target.y() - p0.y };
      if (!e.evt.altKey) delta = edgeSnap(raw, ds.start) ?? delta;
      ds.delta = delta;
      const stage = e.target.getStage()!;
      ds.start.forEach((p, id) => {
        const node = id === item.id ? e.target : stage.findOne(`#${id}`);
        node?.position({ x: p.x + delta.x, y: p.y + delta.y });
      });
    },
    [snapToGrid, edgeSnap],
  );

  const onItemDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, item: { id: ID }) => {
      const ds = dragRef.current;
      // Alleen het item dat daadwerkelijk werd vastgepakt rondt de sleepactie af.
      if (!ds || ds.primary !== item.id) return;
      dragRef.current = null;
      const dx = Math.round(ds.delta.x * 10) / 10;
      const dy = Math.round(ds.delta.y * 10) / 10;
      // Zet alle nodes exact op hun eindpositie (ook bij een verschuiving van 0).
      const stage = e.target.getStage();
      ds.start.forEach((p, id) => stage?.findOne(`#${id}`)?.position({ x: p.x + dx, y: p.y + dy }));
      if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
        update((d) => moveItems(d.room, [...ds.start.keys()], dx, dy));
      }
      attachTransformer();
    },
    [update, attachTransformer],
  );

  // ---- leerlingen verplaatsen in plaatsingsmodus ----
  const onSeatClick = useCallback((seat: Seat, student?: Student) => {
    const s = useAppStore.getState();
    if (student) s.selectStudent(student.id);
    else {
      s.selectStudent(null);
      s.selectSeat(seat.id);
    }
  }, []);

  const onCardDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.getParent()?.moveToTop();
    e.target.opacity(0.85);
    e.target.getStage()!.container().style.cursor = 'grabbing';
  }, []);

  const onCardDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, student: Student, seat: Seat) => {
      const stage = e.target.getStage()!;
      const pos = stage.getRelativePointerPosition();
      e.target.position({ x: 0, y: 0 });
      e.target.opacity(1);
      stage.container().style.cursor = '';
      if (!pos) return;
      const target = deskAtPoint(room.desks, pos);
      const targetSeat = target ? room.seats.find((s) => s.deskId === target.id) : undefined;
      if (targetSeat && targetSeat.id !== seat.id) placeStudent(student.id, targetSeat.id);
      stage.batchDraw();
    },
    [room.desks, room.seats],
  );

  // ---- zoomen en verschuiven ----
  const zoomAt = useCallback(
    (factor: number, center: Point) => {
      const v = useAppStore.getState().view;
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const world = { x: (center.x - v.x) / v.scale, y: (center.y - v.y) / v.scale };
      setView({ scale, x: center.x - world.x * scale, y: center.y - world.y * scale });
    },
    [setView],
  );

  useEffect(() => {
    canvasApi.zoomBy = (f: number) => zoomAt(f, { x: size.width / 2, y: size.height / 2 });
  }, [zoomAt, size]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const factor = Math.exp(-clamp(e.evt.deltaY, -100, 100) * (e.evt.ctrlKey ? 0.01 : 0.0018));
    zoomAt(factor, pointer);
  };

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        if (!spaceDown) setSpaceDown(true);
        if (document.activeElement === document.body || containerRef.current?.contains(document.activeElement)) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [spaceDown]);

  const isBackground = (target: Konva.Node) => target === stageRef.current || target.name() === 'floor';

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current!;
    const wantsPan = e.evt.button === 1 || spaceDown || (e.evt.button === 0 && mode === 'seat' && isBackground(e.target));
    if (wantsPan) {
      e.evt.preventDefault();
      const v = useAppStore.getState().view;
      panRef.current = { cx: e.evt.clientX, cy: e.evt.clientY, vx: v.x, vy: v.y };
      stage.container().style.cursor = 'grabbing';
      if (mode === 'seat' && e.evt.button === 0) {
        const s = useAppStore.getState();
        s.selectStudent(null);
        s.selectSeat(null);
      }
      return;
    }
    if (mode === 'room' && e.evt.button === 0 && isBackground(e.target)) {
      const p = stage.getRelativePointerPosition();
      if (p) setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  };

  const onStageTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length === 2) {
      const [a, b] = [touches[0], touches[1]];
      pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 } };
      panRef.current = null;
    } else if (touches.length === 1 && isBackground(e.target)) {
      const v = useAppStore.getState().view;
      panRef.current = { cx: touches[0].clientX, cy: touches[0].clientY, vx: v.x, vy: v.y };
    }
  };

  const onStageTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    const rect = containerRef.current!.getBoundingClientRect();
    if (touches.length === 2 && pinchRef.current) {
      e.evt.preventDefault();
      const [a, b] = [touches[0], touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const center = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
      zoomAt(dist / pinchRef.current.dist, center);
      pinchRef.current.dist = dist;
    } else if (touches.length === 1 && panRef.current) {
      const p = panRef.current;
      setView({ x: p.vx + touches[0].clientX - p.cx, y: p.vy + touches[0].clientY - p.cy });
    }
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (panRef.current) {
        const p = panRef.current;
        setView({ x: p.vx + e.clientX - p.cx, y: p.vy + e.clientY - p.cy });
      } else if (marquee) {
        const stage = stageRef.current;
        if (!stage) return;
        stage.setPointersPositions(e);
        const p = stage.getRelativePointerPosition();
        if (p) setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
      }
    };
    const up = (e: MouseEvent) => {
      if (panRef.current) {
        panRef.current = null;
        if (stageRef.current) stageRef.current.container().style.cursor = '';
      }
      if (marquee) {
        const x0 = Math.min(marquee.x0, marquee.x1);
        const x1 = Math.max(marquee.x0, marquee.x1);
        const y0 = Math.min(marquee.y0, marquee.y1);
        const y1 = Math.max(marquee.y0, marquee.y1);
        if (x1 - x0 < 4 && y1 - y0 < 4) {
          if (!e.shiftKey) setSelection([]);
        } else {
          const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
          const ids = [...room.desks.filter(inside).map((d) => d.id), ...room.objects.filter(inside).map((o) => o.id)];
          const current = useAppStore.getState().selection;
          setSelection(e.shiftKey ? [...new Set([...current, ...ids])] : ids);
        }
        setMarquee(null);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [marquee, room, setSelection, setView]);

  // ---- slepen vanuit de leerlingenlijst (HTML) ----
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(STUDENT_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const studentId = e.dataTransfer.getData(STUDENT_DRAG_TYPE);
    const stage = stageRef.current;
    if (!studentId || !stage) return;
    e.preventDefault();
    stage.setPointersPositions(e.nativeEvent);
    const p = stage.getRelativePointerPosition();
    if (!p) return;
    const desk = deskAtPoint(room.desks, p);
    const seat = desk ? room.seats.find((s) => s.deskId === desk.id) : undefined;
    if (seat) placeStudent(studentId, seat.id);
    else useAppStore.getState().toast('info', 'Sleep de leerling op een tafel om hem of haar te plaatsen.');
  };

  const cursor = spaceDown ? 'grab' : mode === 'seat' ? 'default' : 'default';

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#eef1f5]"
      style={{ cursor, touchAction: 'none' }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-label="Klassenplattegrond"
      role="region"
    >
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={() => {
            pinchRef.current = null;
            panRef.current = null;
          }}
        >
          <Layer>
            <RoomScene
              plan={plan}
              graph={graph}
              mode={mode}
              showNames
              showGrid={showGrid}
              showZones={showZones}
              showSeatNumbers={showSeatNumbers || mode === 'room'}
              selection={selectionSet}
              highlightSeatIds={highlightSeatIds}
              violatedSeatIds={violatedSeatIds}
              onDeskPointerDown={onDeskPointerDown}
              onDeskDblClick={onDeskDblClick}
              onObjectPointerDown={onObjectPointerDown}
              onItemDragStart={onItemDragStart}
              onItemDragMove={onItemDragMove}
              onItemDragEnd={onItemDragEnd}
              onSeatClick={onSeatClick}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
            />
            {marquee && (
              <Rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="rgba(37,99,235,0.08)"
                stroke="#2563eb"
                strokeWidth={1 / view.scale}
                dash={[4 / view.scale, 3 / view.scale]}
                listening={false}
              />
            )}
            <Transformer
              ref={trRef}
              rotateEnabled
              flipEnabled={false}
              keepRatio={false}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={6}
              anchorSize={9}
              borderStroke="#2563eb"
              anchorStroke="#2563eb"
              rotateAnchorOffset={24}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 4 ? oldBox : newBox)}
              onTransformStart={() => (dragRef.current = null)}
              onTransformEnd={onTransformEnd}
            />
          </Layer>
        </Stage>
      )}
      <CanvasOverlays mode={mode} />
    </div>
  );
}
