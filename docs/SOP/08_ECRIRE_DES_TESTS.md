# SOP 08 · Écrire des tests

- Lancer : `npm test` (vitest). Les tests de base tournent sur PGlite (Postgres dans le processus)
  avec toutes les migrations : `tests/helpers/`.
- **Règle métier** : un test par règle, avec le cas qui passe et le cas refusé.
- **Isolation** : deux établissements, deux comptes ; A ne lit ni n'écrit rien de B.
- **Hubs** : un compte limité au Hub 1 ne voit ni ventes ni stock du Hub 2.
- **Écran** (`tests/noyau.test.jsx`) : ce que voit chaque profil (caissier sans notion de Hub,
  super admin sans le mot « encaissé »…).
- **Production simulée** : la CI rejoue migrations + démo deux fois (idempotence) + pilote API +
  parcours mot de passe (`scripts/verifier_comptes.mjs`).
- **Concurrence** : toute opération qui consomme une ressource limitée (stock, chambre, coupon, solde,
  période à facturer) est appelée simultanément par deux requêtes contre un Supabase local réel ; le
  test vérifie l'état final, pas seulement qu'une requête a été refusée.
- **Navigateur bloquant** : `npm run test:e2e` doit retourner un code non nul au premier parcours en
  échec ou à la moindre erreur console inattendue. La CI ouvre au minimum une page de chaque domaine
  actif sur desktop et les parcours essentiels sur mobile.
- Données : fictives uniquement (`@exemple.test`, noms inventés).

Modèle : [`templates/TEMPLATE_TEST.js`](templates/TEMPLATE_TEST.js).
