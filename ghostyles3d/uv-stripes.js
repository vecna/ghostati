/**
 * ==Ghostyle3D==
 * @name         UV Stripes
 * @version      0.2.0
 * @author       NINA
 * @description  Strisce/chevron oblique disegnate sul volto in spazio UV canonico (port da viso/StripePaletteRenderer).
 * ==/Ghostyle3D==
 *
 * Approccio (analogo a `viso/face_uv.warp_and_blend_uv`):
 *  1. Rasterizziamo il pattern stripe come canvas RGBA 256×256 in UV space.
 *  2. Per ciascuno dei 906 triangoli della mesh canonica MediaPipe calcoliamo
 *     l'affine 2D (uv_pixel → screen_pixel) dai 3 vertici.
 *  3. ctx.save → clip(tri screen) → setTransform(affine) → drawImage(tex,0,0) → restore.
 *
 * Le stripe risultano continue tra triangoli adiacenti perché due vertici
 * condivisi hanno UV identica, quindi l'interpolazione lineare matcha sull'edge.
 *
 * Cache: la texture viene rigenerata solo quando una chiave hash dei parametri
 * cambia, così il render frame-to-frame è solo warp+drawImage.
 */

const UV_PATH = (() => {
   const rel = window.location.pathname.split('/').slice(0, -1).join('/');
   return rel + '/data/face_canonical_uv.json';
})();

let UV_DATA = null;
let loadPromise = null;

function ensureLoaded() {
   if (UV_DATA || loadPromise) return loadPromise;
   loadPromise = fetch(UV_PATH)
      .then(r => {
         if (!r.ok) throw new Error(`HTTP ${r.status}`);
         return r.json();
      })
      .then(d => {
         UV_DATA = d;
         if (window.Ghostati && Ghostati.log) {
            Ghostati.log(`UV map caricata (${d.numLandmarks} landmark, ${d.numTriangles} triangoli)`, 'uv-stripes');
         }
      })
      .catch(err => {
         console.error('[uv-stripes] errore caricamento UV:', err);
         if (window.Ghostati && Ghostati.log) {
            Ghostati.log('Errore caricamento UV map: ' + err.message, 'uv-stripes');
         }
         loadPromise = null;
      });
   return loadPromise;
}

export function onInit() {
   ensureLoaded();
}

export const params = [
   { name: 'angle',    type: 'range',  label: 'Angolo (rad)',    min: 0,    max: Math.PI, step: 0.01, default: 0.37 },
   { name: 'width',    type: 'range',  label: 'Larghezza (UV%)', min: 3,    max: 60,      step: 0.5,  default: 21 },
   { name: 'nColors',  type: 'range',  label: 'N° colori',       min: 2,    max: 4,       step: 1,    default: 3 },
   { name: 'alpha',    type: 'range',  label: 'Opacità',         min: 0,    max: 1,       step: 0.01, default: 0.4 },
   { name: 'gap',      type: 'bool',   label: 'Gap trasparente', default: true },
   { name: 'mode',     type: 'select', label: 'Modalità',        options: ['stripe', 'chevron'], default: 'chevron' }
];

const COLORS = [
   [255, 255, 255],
   [0, 0, 220],
   [0, 255, 255],
   [255, 220, 60]
];

function sampleStripe(u, v, p) {
   const period = Math.max(0.005, p.width / 100);
   const cu = u - 0.5;
   const cv = v - 0.5;
   const projU = p.mode === 'chevron' ? Math.abs(cu) : cu;
   const proj = projU * Math.cos(p.angle) + cv * Math.sin(p.angle);
   let phase = (proj / period) % 1;
   if (phase < 0) phase += 1;
   const total = p.gap ? p.nColors + 1 : p.nColors;
   const idx = Math.floor(phase * total);
   if (p.gap && idx === p.nColors) return null;
   return COLORS[idx % p.nColors];
}

const TEX_SIZE = 256;
let textureCanvas = null;
let textureKey = '';

function regenTexture(p) {
   if (!textureCanvas) {
      textureCanvas = document.createElement('canvas');
      textureCanvas.width = TEX_SIZE;
      textureCanvas.height = TEX_SIZE;
   }
   const tctx = textureCanvas.getContext('2d');
   const img = tctx.createImageData(TEX_SIZE, TEX_SIZE);
   const data = img.data;
   const aByte = Math.round(p.alpha * 255);
   for (let py = 0; py < TEX_SIZE; py++) {
      const v = (py + 0.5) / TEX_SIZE;
      for (let px = 0; px < TEX_SIZE; px++) {
         const u = (px + 0.5) / TEX_SIZE;
         const col = sampleStripe(u, v, p);
         const idx = (py * TEX_SIZE + px) * 4;
         if (col) {
            data[idx]     = col[0];
            data[idx + 1] = col[1];
            data[idx + 2] = col[2];
            data[idx + 3] = aByte;
         } else {
            data[idx + 3] = 0;
         }
      }
   }
   tctx.putImageData(img, 0, 0);
}

function ensureTexture(p) {
   const key = `${p.angle.toFixed(3)}|${p.width.toFixed(2)}|${p.nColors}|${p.alpha.toFixed(3)}|${p.gap ? 1 : 0}|${p.mode}`;
   if (key !== textureKey) {
      regenTexture(p);
      textureKey = key;
   }
}

export function onDraw3D(ctx, landmarks, video, params = {}) {
   if (!UV_DATA) { ensureLoaded(); return; }
   const w = ctx.canvas.width;
   const h = ctx.canvas.height;
   const uv = UV_DATA.uv;
   const tri = UV_DATA.triangles;

   const p = {
      angle:   params.angle   ?? 0.37,
      width:   params.width   ?? 21,
      nColors: Math.max(2, Math.min(COLORS.length, Math.round(params.nColors ?? 3))),
      alpha:   params.alpha   ?? 0.4,
      gap:     params.gap     ?? true,
      mode:    params.mode    ?? 'chevron'
   };
   ensureTexture(p);
   const tex = textureCanvas;

   for (let i = 0; i < tri.length; i++) {
      const t = tri[i];
      const ia = t[0], ib = t[1], ic = t[2];
      const la = landmarks[ia], lb = landmarks[ib], lc = landmarks[ic];
      if (!la || !lb || !lc) continue;
      const ua = uv[ia], ub = uv[ib], uc = uv[ic];
      if (!ua || !ub || !uc) continue;

      // texture pixel (UV * texSize) e screen pixel
      const tAx = ua[0] * TEX_SIZE, tAy = ua[1] * TEX_SIZE;
      const tBx = ub[0] * TEX_SIZE, tBy = ub[1] * TEX_SIZE;
      const tCx = uc[0] * TEX_SIZE, tCy = uc[1] * TEX_SIZE;
      const sAx = la.x * w, sAy = la.y * h;
      const sBx = lb.x * w, sBy = lb.y * h;
      const sCx = lc.x * w, sCy = lc.y * h;

      // Affine 3-point: trova M tale che M*(t_i) = s_i per i in {A,B,C}
      const det = (tAx - tCx) * (tBy - tCy) - (tBx - tCx) * (tAy - tCy);
      if (Math.abs(det) < 1e-6) continue;
      const inv = 1 / det;
      const m11 = ((sAx - sCx) * (tBy - tCy) - (sBx - sCx) * (tAy - tCy)) * inv;
      const m12 = ((sBx - sCx) * (tAx - tCx) - (sAx - sCx) * (tBx - tCx)) * inv;
      const m13 = sCx - m11 * tCx - m12 * tCy;
      const m21 = ((sAy - sCy) * (tBy - tCy) - (sBy - sCy) * (tAy - tCy)) * inv;
      const m22 = ((sBy - sCy) * (tAx - tCx) - (sAy - sCy) * (tBx - tCx)) * inv;
      const m23 = sCy - m21 * tCx - m22 * tCy;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sAx, sAy);
      ctx.lineTo(sBx, sBy);
      ctx.lineTo(sCx, sCy);
      ctx.closePath();
      ctx.clip();
      // Canvas setTransform(a,b,c,d,e,f) usa la matrice [a c e; b d f; 0 0 1]
      ctx.setTransform(m11, m21, m12, m22, m13, m23);
      ctx.drawImage(tex, 0, 0);
      ctx.restore();
   }
}
