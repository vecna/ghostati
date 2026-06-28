import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
  els: {},
  clearOverlay: vi.fn()
}));

vi.mock('../../scripts/utils.js', () => ({
  distance: vi.fn(),
  avgPoint: vi.fn(),
  drawClosedPath: vi.fn(),
  drawOpenPath: vi.fn(),
  roundRect: vi.fn(),
  setLog: vi.fn()
}));

vi.mock('../../scripts/camera.js', () => ({
  resizeCanvas: vi.fn()
}));

vi.mock('../../scripts/db.js', () => ({
  persistDb: vi.fn(),
  renderDbStats: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { distance } from '../../scripts/utils.js';
import { decideEfficacyOutcome } from '../../scripts/engine.js';

describe('engine internals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.MATCH_THRESHOLD = 0.58;
  });

  it('returns unknown when no composited face is found and the DB is empty', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: null,
      obfMinDist: null,
      weakDetection: false,
      obfuscatedResult: null,
      dbEmpty: true
    });

    expect(outcome).toEqual({
      detectionState: 'unknown',
      headline: 'Risultato: NESSUN VOLTO INDIVIDUATO. Rilevatore ingannato! Salva un volto nel DB per testare il riconoscimento.'
    });
  });

  it('returns eluded when no composited face is found and the DB has faces', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: 0.2,
      obfMinDist: null,
      weakDetection: false,
      obfuscatedResult: null,
      dbEmpty: false
    });

    expect(outcome).toEqual({
      detectionState: 'eluded',
      headline: 'Risultato: ECCELLENTE. Il trucco ha frammentato il volto al punto da distruggere l\'algoritmo di rilevamento.'
    });
  });

  it('returns unknown on weak detection when the DB is empty', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: 0.2,
      obfMinDist: 0.3,
      weakDetection: true,
      obfuscatedResult: { descriptor: [0.2] },
      dbEmpty: true
    });

    expect(outcome).toEqual({
      detectionState: 'unknown',
      headline: 'Risultato: BUONO. Detection sul composito forzata a confidenza bassa — face-api non vede chiaramente un volto.'
    });
  });

  it('returns eluded on weak detection when the DB has faces', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: 0.2,
      obfMinDist: 0.3,
      weakDetection: true,
      obfuscatedResult: { descriptor: [0.2] },
      dbEmpty: false
    });

    expect(outcome).toEqual({
      detectionState: 'eluded',
      headline: 'Risultato: BUONO. Detection sul composito forzata a confidenza bassa — face-api non vede chiaramente un volto.'
    });
  });

  it('returns eluded with distance when self-comparison exceeds threshold and the DB is empty', () => {
    distance.mockReturnValue(0.75);

    const result = { descriptor: [0.1, 0.2] };
    const obfuscatedResult = { descriptor: [0.3, 0.4] };
    const outcome = decideEfficacyOutcome({
      result,
      liveMinDist: 0.2,
      obfMinDist: 0.3,
      weakDetection: false,
      obfuscatedResult,
      dbEmpty: true
    });

    expect(distance).toHaveBeenCalledWith(result.descriptor, obfuscatedResult.descriptor);
    expect(outcome).toEqual({
      detectionState: 'eluded',
      headline: 'Risultato: IDENTITÀ NASCOSTA. La tua impronta è irriconoscibile rispetto al volto base. Salva un volto nel DB per testare contro i salvataggi!',
      dist: 0.75
    });
  });

  it('returns matched with distance when self-comparison stays within threshold and the DB is empty', () => {
    distance.mockReturnValue(0.42);

    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1, 0.2] },
      liveMinDist: 0.2,
      obfMinDist: 0.3,
      weakDetection: false,
      obfuscatedResult: { descriptor: [0.3, 0.4] },
      dbEmpty: true
    });

    expect(outcome).toEqual({
      detectionState: 'matched',
      headline: 'Risultato: INSUFFICIENTE. L\'identità biometrica è ancora intatta.',
      dist: 0.42
    });
  });

  it('returns eluded when archive comparison exceeds threshold', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: 0.2,
      obfMinDist: 0.7,
      weakDetection: false,
      obfuscatedResult: { descriptor: [0.2] },
      dbEmpty: false
    });

    expect(outcome).toEqual({
      detectionState: 'eluded',
      headline: 'Risultato: BUONO (Spoofed). Volto rilevato ma l\'identità è irriconoscibile.'
    });
  });

  it('returns matched when archive comparison stays within threshold', () => {
    const outcome = decideEfficacyOutcome({
      result: { descriptor: [0.1] },
      liveMinDist: 0.2,
      obfMinDist: 0.4,
      weakDetection: false,
      obfuscatedResult: { descriptor: [0.2] },
      dbEmpty: false
    });

    expect(outcome).toEqual({
      detectionState: 'matched',
      headline: 'Risultato: INSUFFICIENTE. Il sistema ti riconosce ancora in archivio. Aggiungi geometrie.'
    });
  });
});