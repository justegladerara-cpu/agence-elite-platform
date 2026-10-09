import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les sites clients (sites-clients/*) sont des projets autonomes avec leurs propres tests et dépendances.
    exclude: ['**/node_modules/**', '**/dist/**', 'sites-clients/**'],
    testTimeout: 30_000,
    // La reconstruction de toutes les migrations et l'installation de la démo
    // dépassent parfois la valeur implicite de 10 s sur une machine CI chargée.
    // Ce délai concerne uniquement les hooks de préparation, jamais les tests.
    hookTimeout: 60_000,
  },
});
