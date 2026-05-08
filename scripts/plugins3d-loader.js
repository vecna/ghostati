/**
 * Loader e UI dei Ghostyle 3D — add-on per ghostati.html
 *
 * Carica plugin 3D dichiarati in `ghostylist3d.json`, genera bottoni in
 * #ghostyles3dContainer (drawer impostazioni), gestisce attivazione/
 * disattivazione e instrada gli eventi `landmarks3d` di MediaPipe sul
 * plugin attivo. Convive con i Ghostyle 2D dell'engine senza interferire
 * (canvas e loop di inferenza separati).
 *
 * Protocollo plugin (vedi ghostyles3d/uv-stripes.js):
 *   export function paintUV(ctx, params) { ... }                  obbligatoria
 *   export const params = [...]                                   opzionale
 *   export const textureSize = 256                                opzionale (default 256)
 *   export function onInit() { ... }                              opzionale, una volta al caricamento
 *   export function onClear(ctx) { ... }                          opzionale, alla disattivazione
 *
 * Tutti i plugin 3D sono "UV-space": disegnano un pattern in coordinate UV
 * canoniche su un canvas quadrato `textureSize × textureSize`. Il rendering
 * (warp triangolo-per-triangolo, cache della texture, backface culling) è
 * delegato a `Ghostati.UvRenderer.render(...)` (vedi
 * scripts/ghostyle3d-uv-renderer.js).
 *
 * Schema params (opt-in nel modulo del plugin):
 *   [
 *     { name, type: 'range',  label?, min, max, step?, default },
 *     { name, type: 'bool',   label?, default },
 *     { name, type: 'select', label?, options:[], default },
 *     { name, type: 'color',  label?, default: '#rrggbb' }   // valore al plugin: [r, g, b] interi 0..255
 *   ]
 * Se il plugin non dichiara `params`, il 2° arg di paintUV è {}.
 *
 * Eventi emessi:
 *   effectChanged3d  { active, previous }
 */

(function () {
   const canvas = document.getElementById('mesh3dOverlay');
   const overlayEl = document.getElementById('overlay');
   const container = document.getElementById('ghostyles3dContainer');
   const panel = document.getElementById('plugin3dParamsPanel');
   const video = document.getElementById('video');
   if (!canvas || !overlayEl || !container || !panel || !video) {
      console.warn('[plugins3d] elementi DOM mancanti, skip init');
      return;
   }
   if (!window.Ghostati || !window.Ghostati.events) {
      console.warn('[plugins3d] Ghostati.events non disponibile, skip init');
      return;
   }
   const ctx = canvas.getContext('2d');
   const events = Ghostati.events;
   const loaded = new Map();      // id -> {id, name, module, url}
   const paramValues = new Map(); // id -> {paramName: currentValue}
   let active = null;

   // Esposizione: l'engine (e altri add-on) possono sapere se c'è un plugin 3D attivo.
   // Restituisce l'id corrente o null. Simmetrico a Ghostati.getActiveEffect (2D).
   window.Ghostati.getActiveEffect3d = () => active;

   function syncSize() {
      if (canvas.width !== overlayEl.width || canvas.height !== overlayEl.height) {
         canvas.width = overlayEl.width;
         canvas.height = overlayEl.height;
      }
   }
   function syncMirror() {
      const t = overlayEl.style.transform;
      if (canvas.style.transform !== t) canvas.style.transform = t;
   }
   function clearCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
   }

   async function loadPlugin(url, expectedName, opts = {}) {
      const id = url.split('/').pop().replace('.js', '');
      const cacheBust = opts.cacheBust ? `?t=${Date.now()}` : '';
      try {
         Ghostati.log(`Caricamento plugin 3D da ${url}...`, 'plugins3d');
         const txtRes = await fetch(url + cacheBust, { cache: 'no-store' });
         if (!txtRes.ok) throw new Error(`HTTP ${txtRes.status}`);
         const text = await txtRes.text();
         const nameMatch = text.match(/@name\s+(.+)/);
         const name = nameMatch ? nameMatch[1].trim() : (expectedName || id);
         const module = await import(url + cacheBust);
         loaded.set(id, { id, name, module, url });
         initParamsFromModule(id, module, opts.preserveValues);
         if (typeof module.onInit === 'function') {
            try { module.onInit(); }
            catch (e) { console.error(`[plugins3d] onInit di '${name}':`, e); }
         }
         if (!opts.skipRenderButton) renderButton(id, name);
         Ghostati.log(`Plugin 3D '${name}' caricato.`, 'plugins3d');
         return id;
      } catch (err) {
         console.error('[plugins3d] errore caricamento:', err);
         Ghostati.log(`Impossibile caricare plugin 3D ${expectedName || id}: ${err.message}`, 'plugins3d');
         return null;
      }
   }

   // Coerce param value to schema constraints. Garantisce che il plugin
   // riceva sempre valori validi (range clampato + step intero arrotondato,
   // bool come boolean, select limitato alle options).
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
         // Restituisce sempre [r, g, b] interi 0..255. Accetta in input:
         //   - string '#rrggbb' o '#rgb' → parse
         //   - array [r, g, b] → clamp + round
         // Tutto il resto cade sul default (a sua volta coerciato).
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
         // Default ricoerciato (di solito '#rrggbb' nello schema).
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

   // initParamsFromModule: setta i valori correnti per il plugin. Se
   // `preserveValues` è passato (snapshot da prima del reload), ripristina i
   // valori per i param che esistono ancora con lo stesso nome — i nuovi
   // ottengono il default, i rimossi vengono scartati. Tutti i valori finali
   // passano da `coerceParam` per uniformità con lo schema.
   function initParamsFromModule(id, module, preserveValues) {
      if (!Array.isArray(module.params) || module.params.length === 0) {
         paramValues.delete(id);
         return;
      }
      const values = {};
      for (const p of module.params) {
         const raw = (preserveValues && p.name in preserveValues)
            ? preserveValues[p.name]
            : p.default;
         values[p.name] = coerceParam(p, raw);
      }
      paramValues.set(id, values);
   }

   function syncPanelHeightVar() {
      // Aggiorna --pp-h così la logbox sale di altrettanto via CSS calc()
      const h = panel.classList.contains('visible') ? panel.offsetHeight + 12 : 0;
      document.documentElement.style.setProperty('--pp-h', h + 'px');
   }

   const COLLAPSE_LS_KEY = 'ghostati:plugin3dPanel:collapsed';
   function isPanelCollapsed() {
      try { return localStorage.getItem(COLLAPSE_LS_KEY) === '1'; }
      catch { return false; }
   }
   function setPanelCollapsed(v) {
      try { localStorage.setItem(COLLAPSE_LS_KEY, v ? '1' : '0'); }
      catch {}
   }

   function renderParamsPanel(id) {
      panel.innerHTML = '';
      const entry = loaded.get(id);
      if (!entry || !Array.isArray(entry.module.params) || entry.module.params.length === 0) {
         panel.classList.remove('visible');
         panel.setAttribute('aria-hidden', 'true');
         syncPanelHeightVar();
         return;
      }

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'pp-header';
      header.setAttribute('aria-label', 'Mostra/nascondi parametri');
      const title = document.createElement('span');
      title.className = 'pp-title';
      title.textContent = `Parametri — ${entry.name}`;
      const toggle = document.createElement('span');
      toggle.className = 'pp-toggle';
      toggle.setAttribute('aria-hidden', 'true');
      const updateToggleIcon = () => {
         toggle.textContent = panel.classList.contains('collapsed') ? '▴' : '▾';
      };
      header.addEventListener('click', () => {
         const willCollapse = !panel.classList.contains('collapsed');
         panel.classList.toggle('collapsed', willCollapse);
         setPanelCollapsed(willCollapse);
         updateToggleIcon();
         requestAnimationFrame(syncPanelHeightVar);
      });
      header.appendChild(title);
      header.appendChild(toggle);
      panel.appendChild(header);

      for (const p of entry.module.params) {
         const row = createParamRow(id, p);
         if (row) panel.appendChild(row);
      }
      panel.classList.toggle('collapsed', isPanelCollapsed());
      updateToggleIcon();
      panel.classList.add('visible');
      panel.setAttribute('aria-hidden', 'false');
      // L'altezza è disponibile dopo il reflow → richiedi un frame
      requestAnimationFrame(syncPanelHeightVar);
   }

   function hideParamsPanel() {
      panel.classList.remove('visible');
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML = '';
      syncPanelHeightVar();
   }

   function createParamRow(pluginId, p) {
      const values = paramValues.get(pluginId);
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
      } else if (p.type === 'bool') {
         const input = document.createElement('input');
         input.type = 'checkbox';
         input.checked = Boolean(values[p.name]);
         input.addEventListener('input', () => {
            values[p.name] = coerceParam(p, input.checked);
         });
         ctrlWrap.appendChild(input);
         row.appendChild(ctrlWrap);
      } else if (p.type === 'select') {
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
      } else if (p.type === 'color') {
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
      } else {
         console.warn(`[plugins3d] tipo param sconosciuto: ${p.type}`);
         return null;
      }
      return row;
   }

   function renderButton(id, name) {
      const btn = document.createElement('button');
      btn.className = 'preview-btn';
      btn.textContent = name;
      btn.dataset.effect3d = id;
      btn.onclick = () => toggleActive(id, btn);
      container.appendChild(btn);
   }

   function activatePlugin(id, button) {
      const previous = active;
      if (previous) {
         const prev = loaded.get(previous);
         if (prev && typeof prev.module.onClear === 'function') {
            try { prev.module.onClear(ctx); } catch (e) { console.error(e); }
         }
      }
      active = id;
      container.querySelectorAll('.preview-btn').forEach(b =>
         b.classList.toggle('active', b === button)
      );
      renderParamsPanel(id);
      events.dispatchEvent(new CustomEvent('effectChanged3d', {
         detail: { active, previous }
      }));
      Ghostati.log(`Plugin 3D attivo: ${loaded.get(id).name}`, 'plugins3d');
   }

   function deactivate() {
      if (!active) return;
      const previous = active;
      const entry = loaded.get(previous);
      if (entry && typeof entry.module.onClear === 'function') {
         try { entry.module.onClear(ctx); } catch (e) { console.error(e); }
      }
      active = null;
      container.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('active'));
      clearCanvas();
      hideParamsPanel();
      events.dispatchEvent(new CustomEvent('effectChanged3d', {
         detail: { active: null, previous }
      }));
      Ghostati.log('Plugin 3D disattivato.', 'plugins3d');
   }

   function toggleActive(id, button) {
      if (active === id) {
         deactivate();
         return;
      }
      activatePlugin(id, button);
   }

   events.addEventListener('beforeEfficacyComposite', (e) => {
      const detail = e.detail || {};
      const tCanvas = detail.canvas;
      const tCtx = detail.ctx;
      if (!active || !tCanvas || !tCtx) return;
      // Compositing: copia l'output corrente del plugin 3D dalla mesh3dOverlay
      // sulla temp canvas. Entrambe hanno dimensioni native del video (post fix
      // aspect ratio), quindi 1:1. Se il plugin non ha ancora disegnato per
      // questo frame il canvas è vuoto → drawImage diventa un no-op visivo.
      tCtx.drawImage(canvas, 0, 0, tCanvas.width, tCanvas.height);
   });

   events.addEventListener('landmarks3d', (e) => {
      const landmarks = e.detail && e.detail.landmarks;
      syncSize();
      syncMirror();
      clearCanvas();
      if (!active || !landmarks) return;
      const entry = loaded.get(active);
      if (!entry || typeof entry.module.paintUV !== 'function') return;
      const renderer = window.Ghostati && window.Ghostati.UvRenderer;
      if (!renderer || typeof renderer.render !== 'function') return;
      try {
         ctx.save();
         renderer.render(entry.module, ctx, landmarks, paramValues.get(active) || {});
         ctx.restore();
      } catch (err) {
         console.error(`[plugins3d] render errore in ${entry.name}:`, err);
      }
   });

   const relurl = window.location.pathname.split('/').slice(0, -1).join('/');
   const manifestUrl = relurl + '/ghostylist3d.json';

   async function fetchManifest(opts = {}) {
      const cacheBust = opts.cacheBust ? `?t=${Date.now()}` : '';
      const res = await fetch(manifestUrl + cacheBust, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
   }

   async function loadFromManifest(opts = {}) {
      try {
         const list = await fetchManifest(opts);
         for (const item of list) {
            const effectiveUrl = relurl + '/' + item.url;
            await loadPlugin(effectiveUrl, item.name, opts);
         }
      } catch (err) {
         console.error('[plugins3d] errore lettura manifest:', err);
         Ghostati.log(`Errore lettura ${manifestUrl}: ${err.message}`, 'plugins3d');
      }
   }

   // Reload manuale: re-fetch manifest + re-import di tutti i plugin con
   // cache busting. Preserva il plugin attivo (se ancora presente nel manifest)
   // e i valori dei param per nome.
   async function reloadAll() {
      const previouslyActive = active;
      const valuesSnapshot = new Map();
      for (const [id, vals] of paramValues.entries()) {
         valuesSnapshot.set(id, { ...vals });
      }

      // Disattiva (chiama onClear sul vecchio modulo) prima di sostituire.
      deactivate();

      // Pulisci stato e UI: bottoni plugin (non il bottone reload) + entry caricate.
      loaded.clear();
      paramValues.clear();
      container.querySelectorAll('.preview-btn[data-effect3d]').forEach(b => b.remove());

      try {
         const list = await fetchManifest({ cacheBust: true });
         for (const item of list) {
            const effectiveUrl = relurl + '/' + item.url;
            const id = effectiveUrl.split('/').pop().replace('.js', '');
            const preserve = valuesSnapshot.get(id);
            await loadPlugin(effectiveUrl, item.name, { cacheBust: true, preserveValues: preserve });
         }
      } catch (err) {
         console.error('[plugins3d] errore reload manifest:', err);
         Ghostati.log(`Errore reload ${manifestUrl}: ${err.message}`, 'plugins3d');
      }

      // Riposiziona il pulsante reload in fondo (i nuovi plugin button vengono
      // appesi dopo, quindi senza riposizionamento il reload finirebbe in mezzo).
      if (reloadBtn && reloadBtn.parentNode === container) {
         container.appendChild(reloadBtn);
      }

      // Re-attiva il plugin precedente se ancora presente.
      if (previouslyActive && loaded.has(previouslyActive)) {
         const btn = container.querySelector(`[data-effect3d="${previouslyActive}"]`);
         if (btn) activatePlugin(previouslyActive, btn);
      }
      Ghostati.log('Reload plugin 3D completato.', 'plugins3d');
   }

   let reloadBtn = null;
   function renderReloadButton() {
      reloadBtn = document.createElement('button');
      reloadBtn.className = 'preview-btn reload3d-btn';
      reloadBtn.textContent = '🔄 Ricarica plugin';
      reloadBtn.style.opacity = '0.75';
      reloadBtn.onclick = async () => {
         reloadBtn.disabled = true;
         try { await reloadAll(); }
         finally { reloadBtn.disabled = false; }
      };
      container.appendChild(reloadBtn);
   }

   // Bootstrap
   (async () => {
      await loadFromManifest();
      renderReloadButton();
   })();
})();
