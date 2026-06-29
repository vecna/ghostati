/**
 * @module plugins3d-loader
 * @description
 * Loader e UI dei Ghostyle 3D.
 *
 * Rimane responsabile della logica specifica 3D:
 * - parsing/validazione plugin UV-space
 * - gestione pannello parametri
 * - listener su eventi `landmarks3d` e `beforeEfficacyComposite`
 * - rendering tramite uv renderer
 *
 * Non espone API su window: esporta funzioni che main.js registra su Ghostati.
 */

import { state } from './state.js';
import { setLog } from './utils.js';
import { createUvRenderer } from './ghostyle3d-uv-renderer.js';

const runtime = {
   initialized: false,
   canvas: null,
   overlayEl: null,
   container: null,
   panel: null,
   video: null,
   ctx: null,
   events: null,
   renderer: null,
   relurl: '',
   manifestUrl: '',
   loaded: new Map(),
   paramValues: new Map(),
   active: null,
   reloadBtn: null
};

function log3d(message) {
   setLog(message, 'plugins3d');
}

function requireInit() {
   if (!runtime.initialized) {
      throw new Error('[plugins3d] initPlugins3dLoader() non chiamato');
   }
}

function syncSize() {
   if (runtime.canvas.width !== runtime.overlayEl.width || runtime.canvas.height !== runtime.overlayEl.height) {
      runtime.canvas.width = runtime.overlayEl.width;
      runtime.canvas.height = runtime.overlayEl.height;
   }
}

function syncMirror() {
   const t = runtime.overlayEl.style.transform;
   if (runtime.canvas.style.transform !== t) runtime.canvas.style.transform = t;
}

function clearCanvas() {
   runtime.ctx.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
}

function coerceParam(p, value) {
   if (p.type === 'range') {
      let v = (typeof value === 'number') ? value : parseFloat(value);
      if (!Number.isFinite(v)) v = p.default;
      const step = (typeof p.step === 'number') ? p.step : 0.01;
      if (Number.isInteger(step) && step >= 1) v = Math.round(v);
      if (typeof p.min === 'number') v = Math.max(p.min, v);
      if (typeof p.max === 'number') v = Math.min(p.max, v);
      return v;
   }
   if (p.type === 'bool') return Boolean(value);
   if (p.type === 'select') {
      const opts = Array.isArray(p.options) ? p.options : [];
      return opts.includes(value) ? value : p.default;
   }
   if (p.type === 'color') {
      if (Array.isArray(value) && value.length === 3) {
         return value.map(c => {
            const n = Math.round(Number(c));
            return Math.max(0, Math.min(255, Number.isFinite(n) ? n : 0));
         });
      }
      if (typeof value === 'string') {
         const short = /^#([0-9a-fA-F]{3})$/.exec(value);
         if (short) {
            const c = short[1];
            return [
               parseInt(c[0] + c[0], 16),
               parseInt(c[1] + c[1], 16),
               parseInt(c[2] + c[2], 16)
            ];
         }
         if (/^#[0-9a-fA-F]{6}$/.test(value)) {
            return [
               parseInt(value.slice(1, 3), 16),
               parseInt(value.slice(3, 5), 16),
               parseInt(value.slice(5, 7), 16)
            ];
         }
      }
      return value === p.default ? [0, 0, 0] : coerceParam(p, p.default);
   }
   return value;
}

function rgbToHex(rgb) {
   if (!Array.isArray(rgb) || rgb.length < 3) return '#000000';
   return '#' + rgb.slice(0, 3).map(c => {
      const n = Math.max(0, Math.min(255, Math.round(Number(c) || 0)));
      return n.toString(16).padStart(2, '0');
   }).join('');
}

function initParamsFromModule(id, module, preserveValues) {
   if (!Array.isArray(module.params) || module.params.length === 0) {
      runtime.paramValues.delete(id);
      return;
   }
   const values = {};
   for (const p of module.params) {
      const raw = (preserveValues && p.name in preserveValues)
         ? preserveValues[p.name]
         : p.default;
      values[p.name] = coerceParam(p, raw);
   }
   runtime.paramValues.set(id, values);
}

function syncPanelHeightVar() {
   const h = runtime.panel.classList.contains('visible') ? runtime.panel.offsetHeight + 12 : 0;
   document.documentElement.style.setProperty('--pp-h', h + 'px');
}

const COLLAPSE_LS_KEY = 'ghostati:plugin3dPanel:collapsed';

function isPanelCollapsed() {
   try {
      return localStorage.getItem(COLLAPSE_LS_KEY) === '1';
   } catch {
      return false;
   }
}

function setPanelCollapsed(v) {
   try {
      localStorage.setItem(COLLAPSE_LS_KEY, v ? '1' : '0');
   } catch {
      // no-op
   }
}

function createParamRow(pluginId, p) {
   const values = runtime.paramValues.get(pluginId);
   if (!values) return null;

   const row = document.createElement('div');
   row.className = 'pp-row';

   const label = document.createElement('label');
   label.className = 'pp-label';
   label.textContent = p.label || p.name;
   row.appendChild(label);

   const ctrlWrap = document.createElement('div');
   ctrlWrap.className = 'pp-control';

   if (p.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step || 0.01);
      input.value = String(values[p.name]);

      const valueLabel = document.createElement('span');
      valueLabel.className = 'pp-value';
      const fmt = (v) => (Number(p.step) >= 1 ? String(v) : Number(v).toFixed(2));
      valueLabel.textContent = fmt(values[p.name]);

      input.addEventListener('input', () => {
         const v = coerceParam(p, input.value);
         values[p.name] = v;
         valueLabel.textContent = fmt(v);
      });

      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      row.appendChild(valueLabel);
      return row;
   }

   if (p.type === 'bool') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(values[p.name]);
      input.addEventListener('input', () => {
         values[p.name] = coerceParam(p, input.checked);
      });
      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      return row;
   }

   if (p.type === 'select') {
      const select = document.createElement('select');
      for (const opt of (p.options || [])) {
         const o = document.createElement('option');
         o.value = String(opt);
         o.textContent = String(opt);
         if (opt === values[p.name]) o.selected = true;
         select.appendChild(o);
      }
      select.addEventListener('input', () => {
         values[p.name] = coerceParam(p, select.value);
      });
      ctrlWrap.appendChild(select);
      row.appendChild(ctrlWrap);
      return row;
   }

   if (p.type === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = rgbToHex(values[p.name]);

      const valueLabel = document.createElement('span');
      valueLabel.className = 'pp-value';
      valueLabel.textContent = rgbToHex(values[p.name]);

      input.addEventListener('input', () => {
         values[p.name] = coerceParam(p, input.value);
         valueLabel.textContent = rgbToHex(values[p.name]);
      });

      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      row.appendChild(valueLabel);
      return row;
   }

   console.warn(`[plugins3d] tipo param sconosciuto: ${p.type}`);
   return null;
}

function renderParamsPanel(id) {
   runtime.panel.innerHTML = '';
   const entry = runtime.loaded.get(id);
   if (!entry || !Array.isArray(entry.module.params) || entry.module.params.length === 0) {
      runtime.panel.classList.remove('visible');
      runtime.panel.setAttribute('aria-hidden', 'true');
      syncPanelHeightVar();
      return;
   }

   const header = document.createElement('button');
   header.type = 'button';
   header.className = 'pp-header';
   header.setAttribute('aria-label', 'Mostra/nascondi parametri');

   const title = document.createElement('span');
   title.className = 'pp-title';
   title.textContent = `Parametri - ${entry.name}`;

   const toggle = document.createElement('span');
   toggle.className = 'pp-toggle';
   toggle.setAttribute('aria-hidden', 'true');

   const updateToggleIcon = () => {
      toggle.textContent = runtime.panel.classList.contains('collapsed') ? '▴' : '▾';
   };

   header.addEventListener('click', () => {
      const willCollapse = !runtime.panel.classList.contains('collapsed');
      runtime.panel.classList.toggle('collapsed', willCollapse);
      setPanelCollapsed(willCollapse);
      updateToggleIcon();
      requestAnimationFrame(syncPanelHeightVar);
   });

   header.appendChild(title);
   header.appendChild(toggle);
   runtime.panel.appendChild(header);

   for (const p of entry.module.params) {
      const row = createParamRow(id, p);
      if (row) runtime.panel.appendChild(row);
   }

   runtime.panel.classList.toggle('collapsed', isPanelCollapsed());
   updateToggleIcon();
   runtime.panel.classList.add('visible');
   runtime.panel.setAttribute('aria-hidden', 'false');
   requestAnimationFrame(syncPanelHeightVar);
}

function hideParamsPanel() {
   runtime.panel.classList.remove('visible');
   runtime.panel.setAttribute('aria-hidden', 'true');
   runtime.panel.innerHTML = '';
   syncPanelHeightVar();
}

function activatePluginInternal(id, button) {
   requireInit();
   const entry = runtime.loaded.get(id);
   if (!entry) return false;

   const previous = runtime.active;
   if (previous) {
      const prevEntry = runtime.loaded.get(previous);
      if (prevEntry && typeof prevEntry.module.onClear === 'function') {
         try {
            prevEntry.module.onClear(runtime.ctx);
         } catch (e) {
            console.error(e);
         }
      }
   }

   runtime.active = id;

   runtime.container.querySelectorAll('.preview-btn').forEach((b) => {
      if (!b.dataset.effect3d) return;
      b.classList.toggle('active', b === button || b.dataset.effect3d === id);
   });

   renderParamsPanel(id);
   runtime.events.dispatchEvent(new CustomEvent('effectChanged3d', {
      detail: { active: runtime.active, previous }
   }));
   log3d(`Plugin 3D attivo: ${entry.name}`);
   return true;
}

export function getActiveEffect3d() {
   return runtime.active;
}

export function activateEffect3d(id) {
   requireInit();
   const btn = runtime.container.querySelector(`[data-effect3d="${id}"]`);
   return activatePluginInternal(id, btn || null);
}

export function deactivateEffect3d() {
   requireInit();
   if (!runtime.active) return false;

   const previous = runtime.active;
   const entry = runtime.loaded.get(previous);
   if (entry && typeof entry.module.onClear === 'function') {
      try {
         entry.module.onClear(runtime.ctx);
      } catch (e) {
         console.error(e);
      }
   }

   runtime.active = null;
   runtime.container.querySelectorAll('.preview-btn').forEach((b) => {
      if (!b.dataset.effect3d) return;
      b.classList.remove('active');
   });
   clearCanvas();
   hideParamsPanel();

   runtime.events.dispatchEvent(new CustomEvent('effectChanged3d', {
      detail: { active: null, previous }
   }));
   log3d('Plugin 3D disattivato.');
   return true;
}

export function toggleEffect3d(id) {
   requireInit();
   if (runtime.active === id) return deactivateEffect3d();
   return activateEffect3d(id);
}

function renderButton(id, name) {
   const btn = document.createElement('button');
   btn.className = 'preview-btn';
   btn.textContent = name;
   btn.dataset.effect3d = id;
   btn.onclick = () => {
      if (runtime.active === id) deactivateEffect3d();
      else activatePluginInternal(id, btn);
   };
   runtime.container.appendChild(btn);
}

export async function loadPlugin3d(url, expectedName, opts = {}) {
   requireInit();
   const id = url.split('/').pop().replace('.js', '');
   const cacheBust = opts.cacheBust ? `?t=${Date.now()}` : '';

   try {
      log3d(`Caricamento plugin 3D da ${url}...`);
      const txtRes = await fetch(url + cacheBust, { cache: 'no-store' });
      if (!txtRes.ok) throw new Error(`HTTP ${txtRes.status}`);
      const text = await txtRes.text();
      const nameMatch = text.match(/@name\s+(.+)/);
      const name = nameMatch ? nameMatch[1].trim() : (expectedName || id);
      const module = await import(url + cacheBust);

      runtime.loaded.set(id, { id, name, module, url });
      initParamsFromModule(id, module, opts.preserveValues);

      if (typeof module.onInit === 'function') {
         try {
            module.onInit();
         } catch (e) {
            console.error(`[plugins3d] onInit di '${name}':`, e);
         }
      }

      if (!opts.skipRenderButton) renderButton(id, name);
      log3d(`Plugin 3D '${name}' caricato.`);
      return { id, name, module, url, engine: 'mediapipe' };
   } catch (err) {
      console.error('[plugins3d] errore caricamento:', err);
      log3d(`Impossibile caricare plugin 3D ${expectedName || id}: ${err.message}`);
      return null;
   }
}

async function fetchManifest(manifestUrl, opts = {}) {
   const cacheBust = opts.cacheBust ? `?t=${Date.now()}` : '';
   const response = await fetch(manifestUrl + cacheBust, { cache: 'no-store' });
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   return response.json();
}

export async function reloadPlugins3d(manifestUrl = runtime.manifestUrl) {
   requireInit();
   const previouslyActive = runtime.active;
   const valuesSnapshot = new Map();
   for (const [id, vals] of runtime.paramValues.entries()) {
      valuesSnapshot.set(id, { ...vals });
   }

   deactivateEffect3d();
   runtime.loaded.clear();
   runtime.paramValues.clear();
   runtime.container.querySelectorAll('.preview-btn[data-effect3d]').forEach((b) => b.remove());

   try {
      const list = await fetchManifest(manifestUrl, { cacheBust: true });
      for (const item of list) {
         const effectiveUrl = runtime.relurl + '/' + item.url;
         const id = effectiveUrl.split('/').pop().replace('.js', '');
         const preserve = valuesSnapshot.get(id);
         await loadPlugin3d(effectiveUrl, item.name, { cacheBust: true, preserveValues: preserve });
      }
   } catch (err) {
      console.error('[plugins3d] errore reload manifest:', err);
      log3d(`Errore reload ${manifestUrl}: ${err.message}`);
   }

   if (runtime.reloadBtn && runtime.reloadBtn.parentNode === runtime.container) {
      runtime.container.appendChild(runtime.reloadBtn);
   }

   if (previouslyActive && runtime.loaded.has(previouslyActive)) {
      activateEffect3d(previouslyActive);
   }

   log3d('Reload plugin 3D completato.');
}

function renderReloadButton() {
   runtime.reloadBtn = document.createElement('button');
   runtime.reloadBtn.className = 'preview-btn reload3d-btn';
   runtime.reloadBtn.textContent = '🔄 Ricarica plugin';
   runtime.reloadBtn.style.opacity = '0.75';
   runtime.reloadBtn.onclick = async () => {
      runtime.reloadBtn.disabled = true;
      try {
         await reloadPlugins3d(runtime.manifestUrl);
      } finally {
         runtime.reloadBtn.disabled = false;
      }
   };
   runtime.container.appendChild(runtime.reloadBtn);
}

export function initPlugins3dLoader(options = {}) {
   if (runtime.initialized) return runtime;

   runtime.canvas = document.getElementById(options.canvasId || 'mesh3dOverlay');
   runtime.overlayEl = document.getElementById(options.overlayId || 'overlay');
   runtime.container = document.getElementById(options.containerId || 'ghostyles3dContainer');
   runtime.panel = document.getElementById(options.panelId || 'plugin3dParamsPanel');
   runtime.video = document.getElementById(options.videoId || 'video');

   if (!runtime.canvas || !runtime.overlayEl || !runtime.container || !runtime.panel || !runtime.video) {
      throw new Error('[plugins3d] elementi DOM mancanti');
   }

   runtime.ctx = runtime.canvas.getContext('2d');
   runtime.events = state.ghostatiEvents;

   runtime.relurl = options.baseUrl || window.location.pathname.split('/').slice(0, -1).join('/');
   runtime.manifestUrl = options.manifestUrl || (runtime.relurl + '/ghostylist3d.json');

   const uvPath = options.uvPath || (runtime.relurl + '/data/face_canonical_uv.json');
   runtime.renderer = createUvRenderer({
      uvPath,
      getFaceLandmarker: options.getFaceLandmarker || (() => (window.Ghostati && window.Ghostati.FaceLandmarker) || null),
      log: (message) => setLog(message, 'uv-renderer')
   });
   runtime.renderer.ensureLoaded();

   runtime.events.addEventListener('beforeEfficacyComposite', (e) => {
      const detail = e.detail || {};
      const tCanvas = detail.canvas;
      const tCtx = detail.ctx;
      if (!runtime.active || !tCanvas || !tCtx) return;
      tCtx.drawImage(runtime.canvas, 0, 0, tCanvas.width, tCanvas.height);
   });

   runtime.events.addEventListener('landmarks3d', (e) => {
      const landmarks = e.detail && e.detail.landmarks;
      syncSize();
      syncMirror();
      clearCanvas();
      if (!runtime.active || !landmarks) return;

      const entry = runtime.loaded.get(runtime.active);
      if (!entry || typeof entry.module.paintUV !== 'function') return;

      try {
         runtime.ctx.save();
         runtime.renderer.render(entry.module, runtime.ctx, landmarks, runtime.paramValues.get(runtime.active) || {});
         runtime.ctx.restore();
      } catch (err) {
         console.error(`[plugins3d] render errore in ${entry.name}:`, err);
      }
   });

   runtime.initialized = true;
   return runtime;
}
