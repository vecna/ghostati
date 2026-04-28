function getSourceLabel(sourceKind) {
  return sourceKind === 'file' ? 'FILE LOCALE' : 'WEBCAM';
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const unitBase = 1024;
  const precision = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitBase));

  return `${parseFloat((bytes / Math.pow(unitBase, unitIndex)).toFixed(precision))} ${sizes[unitIndex]}`;
}

export function startMemoryMonitor(memoryLabelEl, intervalMs = 2000) {
  if (!memoryLabelEl) return () => {};

  const intervalId = window.setInterval(() => {
    if (!window.performance || !performance.memory) return;

    const memory = performance.memory;
    memoryLabelEl.textContent = `JS Heap: ${formatBytes(memory.usedJSHeapSize)} / Limite: ${formatBytes(memory.jsHeapSizeLimit)}`;
  }, intervalMs);

  return () => window.clearInterval(intervalId);
}

export class FileSource {
  constructor(file) {
    this.file = file;
    this.kind = 'file';
    this.supportsSelectionControls = true;
    this.url = null;
  }

  async attach(videoEl) {
    if (videoEl.canPlayType(this.file.type) === '') {
      throw new Error(`Formato video non supportato: ${this.file.type}`);
    }

    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }

    videoEl.srcObject = null;
    this.url = URL.createObjectURL(this.file);
    videoEl.src = this.url;
    videoEl.muted = true;
    videoEl.playsInline = true;

    return new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Impossibile caricare il video.'));
    });
  }

  detach(videoEl) {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();

    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }
}

export function createPhaseController({
  els,
  resizeCanvas,
  stopEffectLoop,
  startEffectLoop,
  hasActiveEffect,
  setLog,
  onStateChange
}) {
  return {
    source: null,
    phase: null,

    async enterSelection(newSource) {
      const isSameSource = this.source === newSource;

      if (this.source && !isSameSource) {
        this.source.detach(els.video);
      }

      this.source = newSource;
      this.phase = 'SELECTION';

      stopEffectLoop();

      els.video.controls = this.source.supportsSelectionControls;
      els.video.loop = false;
      els.phaseTransitionBox.style.display = 'block';
      els.phaseStartBtn.style.display = 'inline-block';
      els.phaseStopBtn.style.display = 'none';
      els.videoSourceIndicator.textContent = `SORGENTE: ${getSourceLabel(this.source.kind)} - FASE SELEZIONE`;

      setLog(`Fase attivata: SELEZIONE (${this.source.kind}). Scegli il punto di partenza o premi AVVIA OVERLAY.`, 'Sistema');

      if (!isSameSource) {
        await this.source.attach(els.video);
      }

      resizeCanvas();

      if (this.source.kind === 'webcam') {
        await els.video.play();
      } else {
        els.video.pause();
      }

      els.placeholder.style.display = 'none';
      if (onStateChange) onStateChange({ source: this.source, phase: this.phase });
    },

    async enterOverlay() {
      if (!this.source || this.phase === 'OVERLAY') return;

      this.phase = 'OVERLAY';
      els.video.controls = false;
      els.phaseStartBtn.style.display = 'none';
      els.phaseStopBtn.style.display = 'inline-block';
      els.videoSourceIndicator.textContent = `SORGENTE: ${getSourceLabel(this.source.kind)} - FASE OVERLAY`;

      setLog(`Fase attivata: OVERLAY (${this.source.kind}). Avvio elaborazione video in tempo reale.`, 'Sistema');

      if (this.source.kind === 'file') {
        els.video.loop = true;
        await els.video.play();
      } else if (els.video.paused) {
        await els.video.play();
      }

      if (hasActiveEffect()) {
        startEffectLoop();
      }

      if (onStateChange) onStateChange({ source: this.source, phase: this.phase });
    }
  };
}