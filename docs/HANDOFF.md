# Passation (pour la prochaine personne ou IA)

1. Lire dans l'ordre : `docs/PROJECT_STATE.md` → `docs/DECISIONS.md` → `docs/SOP/README.md` → [SOP 32](SOP/32_REGLES_POUR_LES_IA.md).
2. Installer : `npm ci` ; tester : `npm test` ; lancer en local sans base : `npm run dev` (mode local PGlite, données fictives).
3. Code :
   - base : `supabase/migrations/` (source unique du schéma), démo `supabase/demo/commerce_demo.sql` ;
   - écran : `src/App.jsx` (coquille, connexion), `src/modules/` (une page par dossier), `src/ui/composants.jsx` ;
   - espace Agence Elite : `src/modules/editeur/` (routes dans `EspaceEditeur.jsx`).
4. Production : workflows GitHub « Déploiement de la base », « Sauvegarde de la base », « Pilote en production »,
   « Démo et comptes », « Adresse du site » ([SOP 12](SOP/12_DEPLOYER_EN_PRODUCTION.md), [14](SOP/14_SMOKE_TESTS_PRODUCTION.md)).
5. Interdits : voir [SOP 32](SOP/32_REGLES_POUR_LES_IA.md). En particulier ne jamais modifier une migration appliquée,
   ne jamais supprimer de données, ne jamais écrire de secret.
6. Dernière grosse livraison (2026-10-02) : Hubs, transferts, inventaires, comptes par identifiant, nouvelle interface,
   centre des modules, SOP. Détail : `docs/DECISIONS.md` (entrées du 2026-10-02).
