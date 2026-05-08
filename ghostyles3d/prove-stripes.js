/**
 * ==Ghostyle3D==
 * @name         Prove Stripes
 * @version      0.3.0
 * @author       NINA
 * @description  Strisce/chevron oblique disegnate sul volto in spazio UV canonico (port da viso/StripePaletteRenderer).
 * ==/Ghostyle3D==
 *
 * Plugin Ghostyle3D di tipo "UV-space": disegna un pattern in coordinate UV
 * canoniche su un canvas quadrato (textureSize × textureSize). Il framework
 * (Ghostati.UvRenderer) si occupa del warp triangolo-per-triangolo sul volto,
 * della cache della texture e del backface culling.
 *
 * Le stripe risultano continue tra triangoli adiacenti perché due vertici
 * condivisi hanno UV identica, quindi l'interpolazione lineare matcha sull'edge.
 */

export const params = [
   { name: 'angle',    type: 'range',  label: 'Angolo (rad)',    min: 0,    max: Math.PI, step: 0.01, default: 0.37 },
   { name: 'width',    type: 'range',  label: 'Larghezza (UV%)', min: 3,    max: 60,      step: 0.5,  default: 21 },
   { name: 'nColors',  type: 'range',  label: 'N° colori',       min: 2,    max: 4,       step: 1,    default: 3 },
   { name: 'alpha',    type: 'range',  label: 'Opacità',         min: 0,    max: 1,       step: 0.01, default: 0.4 },
   { name: 'min_phase',type: 'range',  label: 'Fase minima',     min: 0,    max: 1,       step: 0.01, default: 0.5 },
   { name: 'gap',      type: 'bool',   label: 'Gap trasparente', default: true },
   { name: 'mode',     type: 'select', label: 'Modalità',        options: ['stripe', 'chevron'], default: 'chevron' }
];

// Disegniamo solo sulla pelle del volto, escludendo occhi, labbra, sopracciglia
// e iride. Il framework rasterizza queste regioni in spazio UV e applica una
// mask `destination-in` dopo paintUV. Plugin non deve gestire nulla.
export const region = {
   include: 'skin'
};

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
   // const proj = cu * Math.cos(p.angle) + cv * Math.sin(p.angle);

   // let phase = (proj / period) % 1;
   let phase = (proj + 0.5 - p.min_phase/2) / period;

    if (phase > 1.0 || phase < 0.0) {
        return null;
    } else {
        return COLORS[0];
    }


   if (phase < p.min_phase) return null;

   if (phase < 0) phase += 1;

   const total = p.gap ? p.nColors + 1 : p.nColors;
   const idx = Math.floor(phase * total);

   // if (idx > 1) return null;

   if (idx < 0) idx += 1;

   if (p.gap && idx === p.nColors) return null;
   return COLORS[idx % p.nColors];
}

export function paintUV(ctx, params) {
   const w = ctx.canvas.width;
   const h = ctx.canvas.height;
   const aByte = Math.round(p.alpha * 255);
   const img = ctx.createImageData(w, h);
   const data = img.data;
   for (let py = 0; py < h; py++) {
      const v = (py + 0.5) / h;
      for (let px = 0; px < w; px++) {
         const u = (px + 0.5) / w;
         const col = sampleStripe(u, v, params);
         const idx = (py * w + px) * 4;
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
   ctx.putImageData(img, 0, 0);
}
