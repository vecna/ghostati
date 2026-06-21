import { state } from './state.js';
import { setLog } from './utils.js';
import { clearActiveEffect, effectSelected } from './dom.js';

/* window.Ghostati è l'API usata dai ghostyle per interagire con l'applicazione. */
/* Nota sul caricamento dinamico: avvengono 2 chiamate http, la prima
   * è per gestire il testo, con tutti i commenti e metadata, la seconda 
   * è per importare effettivamente il modulo. */
export async function fetchGhostyleMetadata(url) {
   const res = await fetch(url);
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   const text = await res.text();
   const matchName = text.match(/@name\s+(.+)/);
   const id = url.split('/').pop().replace('.js', '');
   const name = matchName ? matchName[1].trim() : id;
   return { id, name, url };
}

export async function importGhostyleModule({ id, name, url }) {
   const module = await import(url);
   return { id, name, module, url };
}

/* if there is onClear function, it will be called */
function deactivateEffect() {

   const style = state.loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onClear) {
      style.module.onClear(els.overlay.getContext('2d'));
   }

   return style;
}

function messageEffectChange(effect, previousEffect) {
   state.ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
      detail: { activeEffect: effect, previous: previousEffect }
   }));
}

export function toggleEffect(effect, button) {

   if (state.activeEffect === effect) {
      setLog(`Effetto ${state.activeEffect} già attivo. Disattivazione in corso...`);
      deactivateEffect();
      clearActiveEffect();
      messageEffectChange(null, effect);
      return;
   }

   let previousEffect = null;
   if (state.activeEffect) {
      previousEffect = state.activeEffect;
      deactivateEffect();
   }

   state.activeEffect = effect;

   const ghstyle = state.loadedGhostyles.get(effect);
   messageEffectChange(effect, previousEffect);

   if (previousEffect) {
      setLog(`Effetto ${previousEffect} disattivato, abiliato ${ghstyle.name}. Sarà applicato al volto nella webcam.`);
   } else {
      setLog(`Effetto ${ghstyle.name} attivato. Sarà applicato al volto nella webcam.`);
   }

   effectSelected(button);

}
