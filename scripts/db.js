import { els } from './dom.js';
import { state } from './state.js';
import { setLog } from './utils.js';

export const STORAGE_KEY = 'local-face-lab-db-v1';

export function loadDb() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { nextId: 0, faces: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faces) || typeof parsed.nextId !== 'number') {
         return { nextId: 0, faces: [] };
      }
      return parsed;
   } catch {
      return { nextId: 0, faces: [] };
   }
}

export function persistDb() {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
   state.ghostatiEvents.dispatchEvent(new CustomEvent('dbChanged', {
      detail: {
         count: state.db.faces.length,
         nextId: state.db.nextId
      }
   }));
}

export function renderDbStats() {
   els.dbCount.textContent = String(state.db.faces.length);
   els.nextId.textContent = String(state.db.nextId);
   els.thresholdLabel.textContent = state.MATCH_THRESHOLD.toFixed(2);

   els.dbCountBadge.textContent = String(state.db.faces.length);
   // els.dbCountBadge.style.display = state.db.faces.length > 0 ? 'inline-block' : 'none';
   els.dbCountBadge.style.display = 'inline-block'; // sempre, anche quando è 0.
}

export function clearDb() {
   state.db = { nextId: 0, faces: [] };
   persistDb();
   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: 'unknown', source: 'clear' }
   }));
   setLog('Archivio locale cancellato. Il contatore ID riparte da 0.');
   renderDbStats();
}
