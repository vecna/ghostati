import { state } from './state.js';
import { setLog } from './utils.js';
import { els, clearActiveEffect, effectSelected } from './dom.js';

/**
 * Retrieves ghostyle metadata from a remote script URL.
 * Parses the script text to extract the `@name` comment and derives an identifier
 * from the filename. Returns an object containing `id`, `name` and the original `url`.
 *
 * window.Ghostati is the local API used by the ghostyle(s)
 * In regards of the loading, you can see from the network manager that each JS is loaded twice.
 * The first time is to extract the metadata, the second time is to import the module.
 * @param {string} url - The URL of the ghostyle script to fetch.
 * @throws {Error} Throws an error if the HTTP request fails or the response is not OK.
 * @see scripts/main.js – loads ghostyle list and calls this function for each URL.
 * @see tests/unit/ghostyles-manager.test.js – unit tests for metadata extraction.
 * @returns {{id: string, name: string, url: string}} Metadata for the ghostyle.
 */
export async function fetchGhostyleMetadata(url) {
   const res = await fetch(url);
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   const text = await res.text();
   const matchName = text.match(/@name\s+(.+)/);
   const id = url.split('/').pop().replace('.js', '');
   const name = matchName ? matchName[1].trim() : id;
   return { id, name, url };
}

/**
 * Dynamically imports a ghostyle module after its metadata has been retrieved.
 * Returns an object containing the original metadata plus the loaded module.
 *
 * @param {{id:string, name:string, url:string}} param - The ghostyle metadata.
 * @returns {{id:string, name:string, module:any, url:string}} The ghostyle with its imported module.
 * @see main.js – after metadata extraction, this function loads the actual ghostyle code.
 * @see tests/unit/ghostyles-manager.test.js – tests import behavior.
 */
export async function importGhostyleModule({ id, name, url }) {
   const module = await import(url);
   return { id, name, module, url };
}

/* if there is onClear function, it will be called */
/**
 * Deactivates the currently active ghostyle effect.
 * If the loaded ghostyle module defines an `onClear` hook, it is invoked with the overlay canvas context to allow the effect to clean up any custom drawing state.
 * Returns the style object for the previously active effect.
 *
 * @returns {any} The style object of the previously active ghostyle, if any.
 * @see toggleEffect – called when switching effects to ensure the previous effect is properly cleared.
 * @see main.js – UI interactions trigger effect toggling which eventually calls this function.
 */
function deactivateEffect() {

   const style = state.loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onClear) {
      style.module.onClear(els.overlay.getContext('2d'));
   }

   return style;
}

/**
 * Dispatches a custom `effectChanged` event to inform the rest of the application about a change in the active ghostyle effect.
 * The event payload includes the new `activeEffect` identifier and the `previous` effect identifier.
 *
 * @param {string|null} effect - The identifier of the newly active effect, or null if none.
 * @param {string|null} previousEffect - The identifier of the effect that was previously active.
 * @see toggleEffect – triggers this notification when an effect is switched.
 * @see main.js – listens for this event to update UI state.
 */
function messageEffectChange(effect, previousEffect) {
   state.ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
      detail: { activeEffect: effect, previous: previousEffect }
   }));
}

/**
 * Toggles a ghostyle effect on or off.
 * Handles activation, deactivation, state updates, logging, and UI selection.
 *
 * @param {string} effect - Identifier of the ghostyle effect.
 * @param {HTMLElement} button - The UI button tied to the effect.
 * @see deactivateEffect – clears previous effect.
 * @see messageEffectChange – notifies of effect changes.
 * @see main.js – UI triggers this toggle.
 */
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
