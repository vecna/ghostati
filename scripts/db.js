/** @module db */
import { els } from './dom.js';
import { state } from './state.js';
import { setLog } from './utils.js';

export const STORAGE_KEY = 'local-face-lab-db-v1';
export const STORAGE_KEY_3D = 'local-face-lab-db-3d-v1';
export const DB3D_MODEL_VERSION = 'image-embedder-v1';

function createEmptyDb3d() {
   return { faces: [], modelVersion: DB3D_MODEL_VERSION };
}

/**
 * Loads the 3D face database (ImageEmbedder embeddings) from `localStorage`.
 *
 * @returns {{faces: Array}} The current 3D database state (no nextId — IDs come from the 2D DB).
 */
export function loadDb3d() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY_3D);
      if (!raw) return createEmptyDb3d();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faces)) return createEmptyDb3d();
      if (parsed.modelVersion !== DB3D_MODEL_VERSION) {
         if (parsed.faces.length > 0) {
            setLog('Database 3D incompatibile col nuovo modello, svuoto', 'db');
         }
         state.db3d = createEmptyDb3d();
         clearDb3d();
         return state.db3d;
      }
      return parsed;
   } catch {
      return createEmptyDb3d();
   }
}

/**
 * Persists the current 3D database (`state.db3d`) to `localStorage`.
 */
export function persistDb3d() {
   localStorage.setItem(STORAGE_KEY_3D, JSON.stringify(state.db3d));
}

/**
 * Clears only the local 3D face database and persists the empty state.
 */
export function clearDb3d() {
   state.db3d = createEmptyDb3d();
   persistDb3d();
}

/**
 * Loads the application's face database from `localStorage`.
 *
 * Returns a fresh default database if no stored data exists or if the data is malformed.
 *
 * @returns {{nextId: number, faces: Array}} The current database state.
 * @see Used in `scripts/main.js` during startup and in unit tests for DB loading.
 */
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

/**
 * Persists the current database (`state.db`) to `localStorage` and emits a `dbChanged`
 * event so UI components can update the displayed count and next ID.
 *
 * @see engine.js – invoked after modifications to ensure storage stays in sync.
 * @see clearDb – called after clearing the database to save the empty state.
 * @see tests/unit/db.test.js – validates that persistence occurs correctly.
 */
export function persistDb() {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
   state.ghostatiEvents.dispatchEvent(new CustomEvent('dbChanged', {
      detail: {
         count: state.db.faces.length,
         nextId: state.db.nextId
      }
   }));
}

/**
 * Renders the current database statistics to the UI.
 *
 * Updates the displayed face count, next ID, matching threshold, and badge.
 *
 * @see main.js – initial rendering after loading the database.
 * @see engine.js – re‑render after any modification to the database.
 * @see clearDb – refreshes the UI after the database is cleared.
 */
export function renderDbStats() {
   els.dbCount.textContent = String(state.db.faces.length);
   els.nextId.textContent = String(state.db.nextId);
   els.thresholdLabel.textContent = state.MATCH_THRESHOLD.toFixed(2);

   els.dbCountBadge.textContent = String(state.db.faces.length);
   // els.dbCountBadge.style.display = state.db.faces.length > 0 ? 'inline-block' : 'none';
   els.dbCountBadge.style.display = 'inline-block'; // sempre, anche quando è 0.
}

/**
 * Clears the local face database, resetting it to an empty state and persisting the change.
 *
 * Emits a `matchStateChanged` event so any listeners can update their UI accordingly.
 *
 * @see persistDb – called after resetting to ensure the empty state is saved.
 * @see renderDbStats – updates the displayed statistics after the clear operation.
 * @see tests/unit/db.test.js – verifies that clearing the database works as expected.
 */
export function clearDb() {
   state.db = { nextId: 0, faces: [] };
   if (state.db3d) state.db3d = createEmptyDb3d();
   persistDb();
   if (state.db3d !== null) persistDb3d();
   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: 'unknown', source: 'clear' }
   }));
   setLog('Archivio locale cancellato. Il contatore ID riparte da 0.');
   renderDbStats();
}
