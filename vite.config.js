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

export default defineConfig({
  plugins: [react(), fichierVersion],
  define: { __VERSION_APP__: JSON.stringify(VERSION_APP) },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.{js,jsx}'] },
});
