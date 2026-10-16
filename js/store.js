import { emptyState, normalizeState } from './logic.js';

const KEY = 'rappresentante:v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (err) {
    console.error('Impossibile leggere i dati salvati', err);
  }
  return emptyState();
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// Chiede al browser di non cancellare i dati quando lo spazio scarseggia.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}
