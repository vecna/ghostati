const hero = document.getElementById('ghostHero');
const link = document.getElementById('ghostLink');
const veil = document.getElementById('ghostVeil');
const topbar = document.getElementById('ghostTopbar');
const progressDisplay = document.getElementById('revealProgress');
const menuToggle = document.getElementById('ghostMenuToggle');
const topbarMenu = document.getElementById('ghostTopbarMenu');

if (!hero || !link || !veil) {
  throw new Error('Ghostati hero elements not found.');
}

const context = veil.getContext('2d', { alpha: true });
if (!context) {
  throw new Error('Canvas 2D context is not available.');
}

const effectState = {
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
  const shouldUnlock = effectState.revealRatio >= SETTINGS.unlockThreshold;
  if (shouldUnlock === effectState.unlocked) {
    return;
  }

  effectState.unlocked = shouldUnlock;
  hero.classList.toggle('is-unlocked', shouldUnlock);
  topbar?.classList.toggle('is-unlocked', shouldUnlock);
  link.setAttribute('aria-disabled', String(!shouldUnlock));
  link.tabIndex = shouldUnlock ? 0 : -1;

  if (effectState.unlockBlinkTimeout) {
    clearTimeout(effectState.unlockBlinkTimeout);
    effectState.unlockBlinkTimeout = null;
  }

  if (shouldUnlock) {
    hero.classList.add('just-unlocked');
    effectState.unlockBlinkTimeout = window.setTimeout(() => {
      hero.classList.remove('just-unlocked');
      effectState.unlockBlinkTimeout = null;
    }, 1400);
    return;
  }

  hero.classList.remove('just-unlocked');
}

function updateProgressDisplay() {
  if (!progressDisplay) {
    return;
  }

  const percentage = Math.round(clamp(effectState.revealRatio) * 100);
  progressDisplay.textContent = `${percentage}%`;
}

function fillVeil() {
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#000000';
  context.fillRect(0, 0, veil.width, veil.height);
}

function indexResize(preserveReveal = true) {
  console.log("check: quando è usato? serve davvero? è uguale a camera.resizeCanvas?")
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

  effectState.revealRatio = sampled ? clamp(transparent / sampled) : 0;
  updateProgressDisplay();
  updateUnlockState();
}

function runInteractionFrame() {
  effectState.interactionQueued = false;
  if (!effectState.hasPointer) {
    return;
  }

  eraseAt(effectState.pointerX, effectState.pointerY);
  updateRevealRatio();
}

function queueInteractionFrame() {
  if (effectState.interactionQueued) {
    return;
  }

  effectState.interactionQueued = true;
  requestAnimationFrame(runInteractionFrame);
}

function queueResize() {
  if (effectState.resizeQueued) {
    return;
  }

  effectState.resizeQueued = true;
  requestAnimationFrame(() => {
    effectState.resizeQueued = false;
    indexResize(true);
  });
}

function handlePointerMove(clientX, clientY) {
  effectState.pointerX = clientX;
  effectState.pointerY = clientY;
  effectState.hasPointer = true;
  queueInteractionFrame();
}

function interactionTargetsTopbar(target) {
  return target instanceof Element && Boolean(target.closest('#ghostTopbar'));
}

window.addEventListener('pointermove', (event) => {
  if (interactionTargetsTopbar(event.target)) {
    return;
  }

  handlePointerMove(event.clientX, event.clientY);
});

window.addEventListener('pointerdown', (event) => {
  if (interactionTargetsTopbar(event.target)) {
    return;
  }

  handlePointerMove(event.clientX, event.clientY);
});

window.addEventListener('touchstart', (event) => {
  if (interactionTargetsTopbar(event.target)) {
    return;
  }

  const touch = event.touches?.[0];
  if (!touch) {
    return;
  }

  handlePointerMove(touch.clientX, touch.clientY);
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  if (interactionTargetsTopbar(event.target)) {
    return;
  }

  const touch = event.touches?.[0];
  if (!touch) {
    return;
  }

  handlePointerMove(touch.clientX, touch.clientY);
}, { passive: true });

window.addEventListener('resize', queueResize);

window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width: 901px) and (pointer: fine)').matches) {
    topbar?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    topbar?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }

  if (event.key === 'Enter' && !effectState.unlocked) {
    event.preventDefault();
  }
});

link.addEventListener('click', (event) => {
  if (!effectState.unlocked) {
    event.preventDefault();
  }
});

menuToggle?.addEventListener('click', () => {
  const nextOpen = !topbar?.classList.contains('is-open');
  topbar?.classList.toggle('is-open', nextOpen);
  menuToggle.setAttribute('aria-expanded', String(Boolean(nextOpen)));
});

topbarMenu?.querySelectorAll('a').forEach((anchor) => {
  anchor.addEventListener('click', () => {
    topbar?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

window.addEventListener('pointerdown', (event) => {
  const target = event.target;
  const clickedOutsideTopbar = target instanceof Element && !target.closest('#ghostTopbar');
  if (!clickedOutsideTopbar) {
    return;
  }

  topbar?.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
});

indexResize(false);
updateProgressDisplay();
updateUnlockState();
