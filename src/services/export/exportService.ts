import { create } from 'zustand';
import type { Plan } from '../../models/types';
import { serializePlans } from '../storage/storage';

export interface ImageExportOptions {
  showNames: boolean;
  title?: string;
  /** Gewenste breedte in pixels (bepaalt de resolutie). */
  targetWidth: number;
}

export interface RenderedImage {
  dataUrl: string;
  width: number;
  height: number;
}

interface ExportRequest {
  plan: Plan;
  options: ImageExportOptions;
  resolve: (img: RenderedImage) => void;
  reject: (e: Error) => void;
}

/** Wachtrij voor de verborgen export-stage (zie ExportHost). */
export const useExportStore = create<{ request: ExportRequest | null; set: (r: ExportRequest | null) => void }>((set) => ({
  request: null,
  set: (request) => set({ request }),
}));

export function renderPlanImage(plan: Plan, options: ImageExportOptions): Promise<RenderedImage> {
  return new Promise((resolve, reject) => {
    if (useExportStore.getState().request) return reject(new Error('Er loopt al een export.'));
    useExportStore.getState().set({ plan, options, resolve, reject });
  });
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'plattegrond'
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportPng(plan: Plan, showNames: boolean, title?: string) {
  const { dataUrl } = await renderPlanImage(plan, { showNames, title, targetWidth: 3200 });
  downloadBlob(await dataUrlToBlob(dataUrl), `klassenplattegrond-${slugify(plan.name)}${showNames ? '' : '-zonder-namen'}.png`);
}

export async function exportPdf(plan: Plan, showNames: boolean, paper: 'a4' | 'a3', title?: string) {
  const [{ jsPDF }, img] = await Promise.all([
    import('jspdf'),
    renderPlanImage(plan, { showNames, targetWidth: paper === 'a3' ? 4200 : 3200 }),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: paper });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 12;
  let top = margin;
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(paper === 'a3' ? 20 : 16);
    doc.text(title, margin, top + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }), pw - margin, top + 6, { align: 'right' });
    doc.setTextColor(0);
    top += 12;
  }
  const availW = pw - 2 * margin;
  const availH = ph - top - margin;
  const ratio = Math.min(availW / img.width, availH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  doc.addImage(img.dataUrl, 'PNG', margin + (availW - w) / 2, top + (availH - h) / 2, w, h, undefined, 'FAST');
  doc.save(`klassenplattegrond-${slugify(plan.name)}-${paper}.pdf`);
}

export function exportJson(plans: Plan[], filenameBase: string) {
  const blob = new Blob([serializePlans(plans)], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `klassenplanner-${slugify(filenameBase)}-${date}.json`);
}
