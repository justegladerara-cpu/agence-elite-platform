import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Identifiant de la version construite : l'application le compare à /version.json pour annoncer une mise à jour.
const VERSION_APP = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || `build-${Date.now()}`;

const fichierVersion = {
  name: 'fichier-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION_APP }) });
  },
};

// Ouverture sans réseau : sw.js garde une copie des écrans de cette version (HTML, scripts, styles, icônes), jamais des
// données. Les appels à la base (autre adresse) ne passent pas par lui. Liste figée à la construction : une nouvelle
// version remplace l'ancienne copie.
const TAILLE_MAX_COPIE = 3 * 1024 * 1024;
const PUBLICS_COPIES = ['/manifest.webmanifest', '/icones/icone-192.png', '/icones/icone-512.png', '/icones/icone-512-masquable.png'];
const serviceWorker = {
  name: 'service-worker',
  apply: 'build',
  generateBundle(_options, bundle) {
    const fichiers = Object.values(bundle)
      .filter((f) => f.fileName !== 'version.json' && (f.code ?? f.source ?? '').length <= TAILLE_MAX_COPIE)
      .map((f) => `/${f.fileName}`);
    const liste = [...new Set(['/', ...fichiers, ...PUBLICS_COPIES])].filter((f) => f !== '/index.html');
    const source = readFileSync(new URL('./src/noyau/sw.modele.js', import.meta.url), 'utf8')
      .replace('__VERSION__', JSON.stringify(VERSION_APP))
      .replace('__FICHIERS__', JSON.stringify(liste));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
};

export default defineConfig({
  plugins: [react(), fichierVersion, serviceWorker],
  define: { __VERSION_APP__: JSON.stringify(VERSION_APP) },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.{js,jsx}'] },
});
