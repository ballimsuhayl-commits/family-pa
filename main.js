const __RAW_REV__ = '__REV__';
window.__ROSIE_REV__ = (__RAW_REV__.includes('__REV__') ? 'r42-local' : __RAW_REV__);
import { startApp } from './app.js';

const root = document.getElementById('app');
startApp(root);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?rev=r42').then((reg) => {
  // If there's an updated SW waiting, activate it immediately.
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    if (!nw) return;
    nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) {
        nw.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });
}).catch(() => {});
let reloaded = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
});
  });
}
