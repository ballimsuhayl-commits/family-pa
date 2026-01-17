import { createApp } from './app.js';

const root = document.getElementById('app');
createApp(root);

// Register service worker for Android PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    } catch (e) {
      // non-fatal
      console.warn('[rosie] service worker failed', e);
    }
  });
}
