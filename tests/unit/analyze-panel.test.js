import { describe, it, expect } from 'vitest';
import { _renderForTests, generateReportText } from '../../scripts/analyze-panel.js';

function makeFaceResult() {
  return {
    age: 34.2,
    gender: 'female',
    expressions: {
      neutral: 0.81,
      happy: 0.1,
      angry: 0.01,
    },
    detection: { score: 0.87 },
    landmarks: { positions: [] },
  };
}

describe('analyze-panel report', () => {
  it('generateReportText includes all sections when face is detected and DB has base face', () => {
    _renderForTests(null, makeFaceResult(), {
      dbHasFaces: true,
      closestId: 3,
      closestDistance: 0.41,
      matchHeadline: 'Corrispondenza trovata: ID 3',
      zoneStates: {
        jawOutline: { delta: 0.052, classification: 'shifted', label: 'Mascella', color: 'red' },
        leftEyeBrow: { delta: 0.028, classification: 'medium', label: 'Sopracciglio sinistro', color: 'orange' },
        rightEyeBrow: { delta: 0.011, classification: 'stable', label: 'Sopracciglio destro', color: 'green' },
        nose: { delta: 0.061, classification: 'shifted', label: 'Naso', color: 'red' },
        leftEye: { delta: 0.014, classification: 'stable', label: 'Occhio sinistro', color: 'green' },
        rightEye: { delta: 0.013, classification: 'stable', label: 'Occhio destro', color: 'green' },
        mouth: { delta: 0.034, classification: 'medium', label: 'Bocca', color: 'orange' },
      },
      embedderClosestSimilarity: 0.847,
    });

    const text = generateReportText();
    expect(text).toContain('Ghostati - Analisi del trucco');
    expect(text).toContain('Volto rilevato: si');
    expect(text).toContain('Riconoscimento (face-api 2D)');
    expect(text).toContain('Analisi per zona (allineata)');
    expect(text).toContain('Embedder 3D (MediaPipe)');
    expect(text).toContain('Cosine similarity con ID 3: 0.847');
  });

  it('generateReportText shows save-base note when face is detected but DB is empty', () => {
    _renderForTests(null, makeFaceResult(), {
      dbHasFaces: false,
      matchHeadline: null,
      zoneStates: null,
      embedderBestId: 7,
      embedderBestSimilarity: 0.903,
    });

    const text = generateReportText();
    expect(text).toContain('Volto rilevato: si');
    expect(text).toContain('Salva un volto base per vedere l\'analisi delle zone.');
  });

  it('generateReportText declares no-face path and keeps relevant sections', () => {
    _renderForTests(null, null, {
      dbHasFaces: false,
      matchHeadline: 'Rilevatore ingannato dal Ghostyle',
      zoneStates: null,
    });

    const text = generateReportText();
    expect(text).toContain('Volto rilevato: no');
    expect(text).toContain('Riconoscimento (face-api 2D)');
    expect(text).toContain('Nessun volto rilevato nello snapshot.');
  });
});
