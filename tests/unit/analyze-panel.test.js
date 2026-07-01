import { describe, it, expect, beforeEach } from 'vitest';
import { _renderForTests, _renderInfoForTests, generateReportText } from '../../scripts/analyze-panel.js';

function makeFaceResult() {
  return {
    age: 34.2,
    gender: 'female',
    expressions: {
      neutral: 0.81,
      happy: 0.1,
      angry: 0.01,
    },
    detection: {
      score: 0.87,
      box: { x: 10, y: 20, width: 120, height: 140 },
    },
    landmarks: { positions: [] },
  };
}

function ensureAnalyzeModalDom() {
  const existing = document.getElementById('analyzeModal');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="analyzeModal" class="analyze-modal" hidden>
      <div id="analyzeBackdrop" class="analyze-backdrop">
        <div id="analyzePanel" class="analyze-panel">
          <div class="analyze-visual-wrap">
            <canvas id="analyzeCanvas" class="analyze-canvas"></canvas>
          </div>
          <div id="analyzeInfo" class="analyze-info"></div>
          <div class="analyze-actions">
            <button id="analyzeCopyBtn" type="button">Copia report</button>
            <button id="analyzeCloseBtn" type="button">Chiudi</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
}

describe('analyze-panel report', () => {
  beforeEach(() => {
    ensureAnalyzeModalDom();
  });

  it('generateReportText keeps the short final format without zone section', () => {
    _renderForTests(null, makeFaceResult(), {
      dbHasFaces: true,
      closestId: 3,
      closestDistance: 0.41,
      matchHeadline: 'Corrispondenza trovata: ID 3 (diversita 41% sotto soglia 58%).',
      embedderClosestSimilarity: 0.847,
    });

    const text = generateReportText();
    expect(text).toContain('### Ghostmaxxing - Analisi del trucco');
    expect(text).toContain('Volto rilevato: si');
    expect(text).toContain('Riconoscimento (face-api 2D)');
    expect(text).toContain('Embedder 3D (MediaPipe)');
    expect(text).toContain('Cosine similarity con ID 3: 0.847');
    expect(text).not.toContain('Analisi per zona');
    expect(text).not.toContain('Trucco piu efficace su:');
  });

  it('renders visual comparison with DB thumbnail image when available', () => {
    const html = _renderInfoForTests(null, makeFaceResult(), {
      dbHasFaces: true,
      closestId: 3,
      closestDistance: 0.41,
      matchHeadline: 'Corrispondenza trovata: ID 3 (diversita 41% sotto soglia 58%).',
      visualComparison: {
        closestId: 3,
        baseDataUrl: 'data:image/jpeg;base64,AAA',
        currentDataUrl: 'data:image/jpeg;base64,BBB',
      },
    });

    expect(html).toContain('Confronto visivo');
    expect(html).toContain('Thumbnail volto base ID 3');
    expect(html).toContain('Thumbnail volto attuale');
    expect(html).toContain('ID 3');
    expect(html).toContain('Tu ora');
  });

  it('renders no preview placeholder when closest thumbnail is missing', () => {
    const html = _renderInfoForTests(null, makeFaceResult(), {
      dbHasFaces: true,
      closestId: 8,
      closestDistance: 0.52,
      matchHeadline: 'Corrispondenza trovata: ID 8 (diversita 52% sotto soglia 58%).',
      visualComparison: {
        closestId: 8,
        baseDataUrl: null,
        currentDataUrl: 'data:image/jpeg;base64,BBB',
      },
    });

    expect(html).toContain('Confronto visivo');
    expect(html).toContain('no preview');
    expect(html).toContain('ID 8');
  });

  it('does not render visual comparison section when DB is empty', () => {
    const html = _renderInfoForTests(null, makeFaceResult(), {
      dbHasFaces: false,
      closestId: null,
      closestDistance: null,
      matchHeadline: null,
      visualComparison: null,
      embedderBestId: 7,
      embedderBestSimilarity: 0.903,
    });

    expect(html).not.toContain('Confronto visivo');
  });
});
