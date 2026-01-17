// Rosie shim: cache-bust + clear old SW
(async ()=> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => r.unregister());
    }
  } catch (e) {}
  import('./main.v2.js');
})();
