# Troubleshooting (GitHub Pages)

## If you see missing icons/avatars after an update
GitHub Pages + Service Worker caching can keep old files.

### Fix (fast)
1. Open the site.
2. Press **Ctrl+Shift+R** (hard refresh).

### Fix (guaranteed)
Chrome:
1. Open DevTools (F12)
2. **Application → Service Workers** → click **Unregister**
3. **Application → Storage** → **Clear site data**
4. Reload the page

This repo bumps the cache version automatically on deploy, but browsers can still keep an older SW until it refreshes.
