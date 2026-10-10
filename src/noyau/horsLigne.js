// Inscrit le service worker (sw.js) en production : l'application s'ouvre ensuite même sans réseau. Les données, elles,
// demandent toujours la connexion. Pas en démonstration locale ni en développement.
export function inscrireOuvertureHorsLigne(env = import.meta.env, nav = globalThis.navigator) {
  if (env.MODE !== 'production' || !nav?.serviceWorker) return false;
  globalThis.addEventListener?.('load', () => {
    nav.serviceWorker.register(`${env.BASE_URL}sw.js`).catch(() => {});
  });
  return true;
}
