/**
 * ==Ghostyle3D==
 * @name         UV Stripes
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
   { name: 'angle',   type: 'range',  label: 'Angolo (rad)',    min: 0, max: Math.PI, step: 0.01, default: 0.37 },
   { name: 'width',   type: 'range',  label: 'Larghezza (UV%)', min: 3, max: 60,      step: 0.5,  default: 21 },
   { name: 'nColors', type: 'range',  label: 'N° colori',       min: 2, max: 4,       step: 1,    default: 3 },
   { name: 'alpha',   type: 'range',  label: 'Opacità',         min: 0, max: 1,       step: 0.01, default: 0.4 },
   { name: 'gap',     type: 'bool',   label: 'Gap trasparente', default: true },
   { name: 'mode',    type: 'select', label: 'Modalità',        options: ['stripe', 'chevron'], default: 'chevron' },
   { name: 'color1',  type: 'color',  label: 'Colore 1',        default: '#ffffff' },
   { name: 'color2',  type: 'color',  label: 'Colore 2',        default: '#0000dc' },
   { name: 'color3',  type: 'color',  label: 'Colore 3',        default: '#00ffff' },
   { name: 'color4',  type: 'color',  label: 'Colore 4',        default: '#ffdc3c' }
];

// Disegniamo solo sulla pelle del volto, escludendo occhi, labbra, sopracciglia
// e iride. Il framework rasterizza queste regioni in spazio UV e applica una
// mask `destination-in` dopo paintUV. Plugin non deve gestire nulla.
export const region = {
   include: 'skin'
};

function sampleStripe(u, v, params, palette) {
   const period = Math.max(0.005, params.width / 100);
   const cu = u - 0.5;
   const cv = v - 0.5;
   const projU = params.mode === 'chevron' ? Math.abs(cu) : cu;
   const proj = projU * Math.cos(params.angle) + cv * Math.sin(params.angle);
   let phase = (proj / period) % 1;
   if (phase < 0) phase += 1;
   const total = params.gap ? params.nColors + 1 : params.nColors;
   const idx = Math.floor(phase * total);
   if (params.gap && idx === params.nColors) return null;
   return palette[idx % params.nColors];
}

export function paintUV(ctx, params) {
   const w = ctx.canvas.width;
   const h = ctx.canvas.height;
   const palette = [params.color1, params.color2, params.color3, params.color4];
   const aByte = Math.round(params.alpha * 255);
   const img = ctx.createImageData(w, h);
   const data = img.data;
   for (let py = 0; py < h; py++) {
      const v = (py + 0.5) / h;
      for (let px = 0; px < w; px++) {
         const u = (px + 0.5) / w;
         const col = sampleStripe(u, v, params, palette);
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
