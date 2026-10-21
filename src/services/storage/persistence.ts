import { createDemoPlan } from '../../data/demo';
import { SCHEMA_VERSION } from '../../models/types';
import { useAppStore } from '../../store/appStore';
import { getBrowserStorage, loadData, saveData, type StorageLike } from './storage';

let storage: StorageLike | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Schrijft de huidige toestand direct naar localStorage. */
export function saveNow(): boolean {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const s = useAppStore.getState();
  const result = saveData(storage, {
    schemaVersion: SCHEMA_VERSION,
    activePlanId: s.activePlanId,
    plans: s.planOrder.map((id) => s.plans[id]),
  });
  s.setSaveStatus(result.ok ? 'saved' : 'error', result.error ?? null);
  return result.ok;
}

/**
 * Laadt opgeslagen gegevens (of de demoklas bij het eerste gebruik) en start automatisch opslaan.
 */
export function initPersistence(): void {
  storage = getBrowserStorage();
  const store = useAppStore.getState();
  const loaded = loadData(storage);
  if (loaded.data && loaded.data.plans.length > 0) {
    store.hydrate(loaded.data.plans, loaded.data.activePlanId);
    store.setSaveStatus('saved');
  } else {
    store.hydrate([createDemoPlan(true)], null);
  }
  if (!storage) {
    store.setStorageWarning(
      'Deze browser staat lokaal opslaan niet toe (bijvoorbeeld in een ingesloten pagina of privévenster). Wijzigingen gaan verloren bij het sluiten; maak een back-up via Exporteren → JSON.',
    );
  } else if (loaded.error) {
    store.setStorageWarning(loaded.error);
  }
  if (loaded.warnings.length) store.toast('warning', loaded.warnings[0]);

  let prev = useAppStore.getState();
  useAppStore.subscribe((s) => {
    if (s.plans === prev.plans && s.activePlanId === prev.activePlanId && s.planOrder === prev.planOrder) return;
    prev = s;
    if (s.saveStatus !== 'pending') s.setSaveStatus('pending');
    if (timer) clearTimeout(timer);
    timer = setTimeout(saveNow, 600);
  });
  window.addEventListener('beforeunload', () => {
    if (timer) saveNow();
  });
  if (!loaded.data) saveNow();
}
