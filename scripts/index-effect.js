const hero = document.getElementById('ghostHero');
const link = document.getElementById('ghostLink');
const veil = document.getElementById('ghostVeil');

if (!hero || !link || !veil) {
  throw new Error('Ghostati hero elements not found.');
}

const context = veil.getContext('2d', { alpha: true });
if (!context) {
  throw new Error('Canvas 2D context is not available.');
}

const state = {
  unlocked: false,
  revealRatio: 0,
  pointerX: 0,
  pointerY: 0,
  hasPointer: false,
  interactionQueued: false,
  resizeQueued: false,
  unlockBlinkTimeout: null,
};

const SETTINGS = {
  brushRadius: 40,
  brushEdge: 70,
  unlockThreshold: 0.34,
  sampleStep: 18,
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function updateUnlockState() {
  const shouldUnlock = state.revealRatio >= SETTINGS.unlockThreshold;
  if (shouldUnlock === state.unlocked) {
    return;
  }

  state.unlocked = shouldUnlock;
  hero.classList.toggle('is-unlocked', shouldUnlock);
  link.setAttribute('aria-disabled', String(!shouldUnlock));
  link.tabIndex = shouldUnlock ? 0 : -1;

  if (state.unlockBlinkTimeout) {
    clearTimeout(state.unlockBlinkTimeout);
    state.unlockBlinkTimeout = null;
  }

  if (shouldUnlock) {
    hero.classList.add('just-unlocked');
    state.unlockBlinkTimeout = window.setTimeout(() => {
      hero.classList.remove('just-unlocked');
      state.unlockBlinkTimeout = null;
    }, 1400);
    return;
  }

  hero.classList.remove('just-unlocked');
}

function fillVeil() {
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#000000';
  context.fillRect(0, 0, veil.width, veil.height);
}

function resizeCanvas(preserveReveal = true) {
  const bounds = hero.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width));
  const height = Math.max(1, Math.floor(bounds.height));

  const previous = preserveReveal
    ? context.getImageData(0, 0, veil.width || 1, veil.height || 1)
    : null;

  veil.width = width;
  veil.height = height;

  fillVeil();

  if (previous) {
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = previous.width;
    copyCanvas.height = previous.height;
    const copyCtx = copyCanvas.getContext('2d');

    if (copyCtx) {
      copyCtx.putImageData(previous, 0, 0);
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(copyCanvas, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
  }

  updateRevealRatio();
}

function eraseAt(clientX, clientY) {
  const rect = veil.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const innerRadius = SETTINGS.brushRadius;
  const outerRadius = SETTINGS.brushRadius + SETTINGS.brushEdge;

  const gradient = context.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, outerRadius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
}

function updateRevealRatio() {
  const width = veil.width;
  const height = veil.height;
  const step = SETTINGS.sampleStep;

  let sampled = 0;
  let transparent = 0;

  for (let y = 0; y < height; y += step) {
    const sampleHeight = Math.min(step, height - y);
    const row = context.getImageData(0, y, width, sampleHeight).data;

    for (let i = 3; i < row.length; i += 4 * step) {
      sampled += 1;
      if (row[i] < 220) {
        transparent += 1;
      }
    }
  }

  state.revealRatio = sampled ? clamp(transparent / sampled) : 0;
  updateUnlockState();
}

function runInteractionFrame() {
  state.interactionQueued = false;
  if (!state.hasPointer) {
    return;
  }

  eraseAt(state.pointerX, state.pointerY);
  updateRevealRatio();
}

function queueInteractionFrame() {
  if (state.interactionQueued) {
    return;
  }

  state.interactionQueued = true;
  requestAnimationFrame(runInteractionFrame);
}

function queueResize() {
  if (state.resizeQueued) {
    return;
  }

  state.resizeQueued = true;
  requestAnimationFrame(() => {
    state.resizeQueued = false;
    resizeCanvas(true);
  });
}

function handlePointerMove(clientX, clientY) {
  state.pointerX = clientX;
  state.pointerY = clientY;
  state.hasPointer = true;
  queueInteractionFrame();
}

window.addEventListener('pointermove', (event) => {
  handlePointerMove(event.clientX, event.clientY);
});

window.addEventListener('pointerdown', (event) => {
  handlePointerMove(event.clientX, event.clientY);
});

window.addEventListener('touchstart', (event) => {
  const touch = event.touches?.[0];
  if (!touch) {
    return;
  }

  handlePointerMove(touch.clientX, touch.clientY);
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  const touch = event.touches?.[0];
  if (!touch) {
    return;
  }

  handlePointerMove(touch.clientX, touch.clientY);
}, { passive: true });

window.addEventListener('resize', queueResize);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !state.unlocked) {
    event.preventDefault();
  }
});

link.addEventListener('click', (event) => {
  if (!state.unlocked) {
    event.preventDefault();
  }
});

resizeCanvas(false);
updateUnlockState();
