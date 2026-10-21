import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layer, Rect, Stage, Text } from 'react-konva';
import { buildSeatGraph } from '../../services/room/seatGraph';
import { useExportStore } from '../../services/export/exportService';
import { RoomScene } from './RoomScene';
import { roomFrame } from './sceneUtils';

const TITLE_H = 70;

/**
 * Verborgen stage die alleen de plattegrond tekent (zonder menu's, selecties of raster)
 * en daar een afbeelding met hoge resolutie van maakt.
 */
export function ExportHost() {
  const request = useExportStore((s) => s.request);
  const clear = useExportStore((s) => s.set);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    if (!request) return;
    const id = setTimeout(() => {
      try {
        const stage = stageRef.current;
        if (!stage) throw new Error('Export kon niet worden voorbereid.');
        const pixelRatio = Math.min(6, Math.max(1.5, request.options.targetWidth / stage.width()));
        const url = stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
        request.resolve({ dataUrl: url, width: stage.width() * pixelRatio, height: stage.height() * pixelRatio });
      } catch (e) {
        request.reject(e as Error);
      } finally {
        clear(null);
      }
    }, 30);
    return () => clearTimeout(id);
  }, [request, clear]);

  if (!request) return null;
  const { plan, options } = request;
  const frame = roomFrame(plan.room, 20);
  const titleH = options.title ? TITLE_H : 0;
  const graph = buildSeatGraph(plan.room);

  return createPortal(
    <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, width: frame.width, height: frame.height + titleH, pointerEvents: 'none' }}>
      <Stage ref={stageRef} width={frame.width} height={frame.height + titleH}>
        <Layer>
          <Rect x={0} y={0} width={frame.width} height={frame.height + titleH} fill="#ffffff" />
          {options.title && (
            <Text x={24} y={22} width={frame.width - 48} text={options.title} fontSize={30} fontStyle="bold" fill="#0f172a" />
          )}
        </Layer>
        <Layer x={-frame.x} y={-frame.y + titleH}>
          <RoomScene
            plan={plan}
            graph={graph}
            mode="export"
            showNames={options.showNames}
            numberOnly={!options.showNames}
            showGrid={false}
            showZones={false}
            showSeatNumbers={false}
          />
        </Layer>
      </Stage>
    </div>,
    document.body,
  );
}
