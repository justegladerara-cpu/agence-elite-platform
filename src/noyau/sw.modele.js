// Modèle du service worker (rempli à la construction par vite.config.js, publié en /sw.js).
// Rôle unique : que l'application s'ouvre sans réseau. Il garde les fichiers de l'application de cette version,
// jamais les données : les appels à la base (autre adresse), /version.json et tout ce qui n'est pas un GET passent tels quels.
const VERSION = __VERSION__;
const FICHIERS = __FICHIERS__;
const COPIE = `agence-elite-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(COPIE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k.startsWith('agence-elite-') && k !== COPIE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/version.json' || url.pathname === '/sw.js') return;
  if (r.mode === 'navigate') {
    // Page : le réseau d'abord (version la plus récente), la copie si le réseau manque.
    e.respondWith(fetch(r).catch(() => caches.match('/', { cacheName: COPIE, ignoreVary: true })));
    return;
  }
  if (FICHIERS.includes(url.pathname)) {
    // Fichiers de la version (noms uniques par construction) : la copie d'abord.
    e.respondWith(caches.match(r, { cacheName: COPIE, ignoreVary: true }).then((x) => x || fetch(r)));
  }
});
