# Troubleshooting

## If icons/avatars don’t show after updating GitHub Pages
This app uses a Service Worker for offline support. Sometimes browsers keep an old cache.

### Fix (fast)
- Press **Ctrl+Shift+R** (hard refresh)

### Fix (guaranteed)
Chrome:
1. F12 → Application
2. Service Workers → Unregister
3. Storage → Clear site data
4. Reload
