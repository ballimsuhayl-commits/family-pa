import { startApp } from './app.js';

const root = document.getElementById('app');
startApp(root);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
