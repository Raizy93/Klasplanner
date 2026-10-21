import { useEffect } from 'react';
import { GRID_SIZE } from '../models/constants';
import type { Plan } from '../models/types';
import { removeDesksFromPlan } from '../services/plan/planOps';
import { duplicateItems, groupDesks, moveItems, removeObjects, rotateItems, ungroupDesks } from '../services/room/roomOps';
import { activePlan, useAppStore } from '../store/appStore';
import { toggleStudentLock } from '../store/seatActions';
import { canvasApi } from '../components/canvas/canvasApi';

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/**
 * Sneltoetsen:
 *  Ctrl+Z / Ctrl+Y (of Ctrl+Shift+Z)  ongedaan maken / opnieuw
 *  Delete / Backspace                 selectie verwijderen (Lokaal)
 *  Ctrl+D                             dupliceren (Lokaal)
 *  Ctrl+G / Ctrl+Shift+G              koppelen / losmaken (Lokaal)
 *  R / Shift+R                        draaien met / tegen de klok in (Lokaal)
 *  Pijltjes (Shift = 1 cm)            verschuiven (Lokaal)
 *  L                                  geselecteerde leerling vastzetten / ontgrendelen
 *  + / - / 0                          zoomen / passend maken
 *  Escape                             selectie opheffen
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const s = useAppStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z' && !isTyping()) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y' && !isTyping()) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (isTyping()) return;

      const roomMode = s.activeTab === 'room';
      const sel = s.selection;
      if (roomMode && sel.length > 0) {
        const plan = activePlan(s);
        const deskIds = sel.filter((id) => plan.room.desks.some((d) => d.id === id));
        if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          s.update((d) => {
            removeDesksFromPlan(d as Plan, deskIds);
            removeObjects(d.room as Plan['room'], sel);
          });
          return;
        }
        if (mod && key === 'd') {
          e.preventDefault();
          let ids: string[] = [];
          s.update((d) => void (ids = duplicateItems(d.room as Plan['room'], sel)));
          s.setSelection(ids);
          return;
        }
        if (mod && key === 'g') {
          e.preventDefault();
          if (e.shiftKey) s.update((d) => ungroupDesks(d.room as Plan['room'], deskIds));
          else if (deskIds.length >= 2) s.update((d) => void groupDesks(d.room as Plan['room'], deskIds));
          return;
        }
        if (!mod && key === 'r') {
          e.preventDefault();
          s.update((d) => rotateItems(d.room as Plan['room'], sel, e.shiftKey ? -90 : 90));
          return;
        }
        const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
        if (arrows[key]) {
          e.preventDefault();
          const step = e.shiftKey ? 1 : GRID_SIZE;
          const [dx, dy] = arrows[key];
          s.update((d) => moveItems(d.room as Plan['room'], sel, dx * step, dy * step), { coalesceKey: 'nudge' });
          return;
        }
      }
      if (key === 'escape') {
        s.setSelection([]);
        s.selectStudent(null);
        s.selectSeat(null);
        return;
      }
      if (!mod && key === 'l' && !roomMode && s.selectedStudentId) {
        toggleStudentLock(s.selectedStudentId);
        return;
      }
      if (!mod && (key === '+' || key === '=')) canvasApi.zoomBy(1.2);
      else if (!mod && key === '-') canvasApi.zoomBy(1 / 1.2);
      else if (!mod && key === '0') s.requestFit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
