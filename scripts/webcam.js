export class WebcamSource {
  constructor() {
    this.kind = 'webcam';
    this.supportsSelectionControls = false;
    this.stream = null;
  }

  async attach(videoEl) {
    if (this.stream) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: 'user'
      },
      audio: false
    });

    videoEl.srcObject = this.stream;
    videoEl.muted = true;
    videoEl.playsInline = true;

    return new Promise(resolve => {
      videoEl.onloadedmetadata = () => resolve();
    });
  }

  detach(videoEl) {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    videoEl.srcObject = null;
  }
}

export function createMirrorController({ buttonEl, videoEl, overlayEl }) {
  let isMirrored = false;

  const applyMirrorState = () => {
    const scale = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
    videoEl.style.transform = scale;
    overlayEl.style.transform = scale;
    buttonEl.classList.toggle('mirrored', isMirrored);
    buttonEl.textContent = isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
  };

  buttonEl.addEventListener('click', () => {
    isMirrored = !isMirrored;
    applyMirrorState();
  });

  applyMirrorState();

  return {
    isMirrored: () => isMirrored,
    applyMirrorState
  };
}