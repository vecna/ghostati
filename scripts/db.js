
function loadDb() {
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

function persistDb(stateo) {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(stateo.db));
   stateo.ghostatiEvents.dispatchEvent(new CustomEvent('dbChanged', {
      detail: {
         count: stateo.db.faces.length,
         nextId: stateo.db.nextId
      }
   }));
}

function renderDbStats(stateo, elso) {
   elso.dbCount.textContent = String(stateo.db.faces.length);
   elso.nextId.textContent = String(stateo.db.nextId);
   elso.thresholdLabel.textContent = stateo.MATCH_THRESHOLD.toFixed(2);

   elso.dbCountBadge.textContent = String(stateo.db.faces.length);
   // elso.dbCountBadge.style.display = stateo.db.faces.length > 0 ? 'inline-block' : 'none';
   elso.dbCountBadge.style.display = 'inline-block'; // sempre, anche quando è 0.
}