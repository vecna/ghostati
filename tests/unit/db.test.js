import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../scripts/main.js', () => ({
  els: {
    dbCount: { textContent: '' },
    nextId: { textContent: '' },
    thresholdLabel: { textContent: '' },
    dbCountBadge: { textContent: '', style: { display: '' } }
  }
}));

vi.mock('../../scripts/utils.js', () => ({
  setLog: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { setLog } from '../../scripts/utils.js';
import { els } from '../../scripts/dom.js';
import { STORAGE_KEY, loadDb, persistDb, renderDbStats, clearDb } from '../../scripts/db.js';

function defaultDb() {
  return { nextId: 0, faces: [] };
}

describe('db module', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    state.db = defaultDb();
    state.MATCH_THRESHOLD = 0.58;
    state.ghostatiEvents = new EventTarget();

    els.dbCount.textContent = '';
    els.nextId.textContent = '';
    els.thresholdLabel.textContent = '';
    els.dbCountBadge.textContent = '';
    els.dbCountBadge.style.display = '';
  });

  describe('loadDb', () => {
    it('returns default DB when storage is empty', () => {
      expect(loadDb()).toEqual(defaultDb());
    });

    it('returns parsed DB when storage contains a valid payload', () => {
      const stored = { nextId: 2, faces: [{ id: 1, descriptor: [0.1, 0.2] }] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      expect(loadDb()).toEqual(stored);
    });

    it('returns default DB when payload shape is invalid', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextId: 'wrong', faces: [] }));
      expect(loadDb()).toEqual(defaultDb());

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextId: 1, faces: null }));
      expect(loadDb()).toEqual(defaultDb());
    });

    it('returns default DB when payload is malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not-json');
      expect(loadDb()).toEqual(defaultDb());
    });
  });

  describe('persistDb', () => {
    it('stores DB and dispatches dbChanged event with summary', () => {
      state.db = { nextId: 3, faces: [{ id: 0 }, { id: 1 }] };
      const onDbChanged = vi.fn();
      state.ghostatiEvents.addEventListener('dbChanged', onDbChanged);

      persistDb();

      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(state.db));
      expect(onDbChanged).toHaveBeenCalledTimes(1);
      expect(onDbChanged.mock.calls[0][0].detail).toEqual({ count: 2, nextId: 3 });
    });
  });

  describe('renderDbStats', () => {
    it('updates counters, threshold label and badge visibility', () => {
      state.db = { nextId: 5, faces: [{ id: 0 }, { id: 1 }, { id: 2 }] };
      state.MATCH_THRESHOLD = 0.6;

      renderDbStats();

      expect(els.dbCount.textContent).toBe('3');
      expect(els.nextId.textContent).toBe('5');
      expect(els.thresholdLabel.textContent).toBe('0.60');
      expect(els.dbCountBadge.textContent).toBe('3');
      expect(els.dbCountBadge.style.display).toBe('inline-block');
    });
  });

  describe('clearDb', () => {
    it('resets DB, persists it, emits matchStateChanged, logs and re-renders stats', () => {
      state.db = { nextId: 9, faces: [{ id: 7 }] };
      state.MATCH_THRESHOLD = 0.58;
      const onDbChanged = vi.fn();
      const onMatchStateChanged = vi.fn();
      state.ghostatiEvents.addEventListener('dbChanged', onDbChanged);
      state.ghostatiEvents.addEventListener('matchStateChanged', onMatchStateChanged);

      clearDb();

      expect(state.db).toEqual(defaultDb());
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(defaultDb()));
      expect(onDbChanged).toHaveBeenCalledTimes(1);
      expect(onMatchStateChanged).toHaveBeenCalledTimes(1);
      expect(onMatchStateChanged.mock.calls[0][0].detail).toEqual({ detectionState: 'unknown', source: 'clear' });
      expect(setLog).toHaveBeenCalledWith('Archivio locale cancellato. Il contatore ID riparte da 0.');
      expect(els.dbCount.textContent).toBe('0');
      expect(els.nextId.textContent).toBe('0');
      expect(els.dbCountBadge.textContent).toBe('0');
    });
  });
});
