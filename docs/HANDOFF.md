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

## HANDOFF CODEX → CLAUDE — THE DREAM

### Pourquoi la gouvernance a changé

`AGENTS.md` renvoyait encore uniquement à la tâche 001 et répétait les interdictions du Lot 1, alors que `PROJECT_STATE`, l'historique et 46 migrations confirmaient Commerce, Restaurant, Hôtel et les modules transversaux en production. À la demande explicite du propriétaire, la tâche 001 reste archivée et la tâche active devient `008-onboarding-the-dream.md`. `AGENTS.md` limite désormais les interdictions Lot 1 aux tâches 001–007 et conserve l'obligation des workflows protégés.

### Livraison préparée

- Migration `20261003000017_import_catalogue_restaurant.sql` : colonnes génériques de variante, ordre, disponibilité/épuisement et RPC `importer_catalogue` avec permission `articles.gerer`, dry-run, références idempotentes, audit par les triggers existants et aucune création de stock.
- Écran Articles : lecture des colonnes professionnelles supplémentaires, dry-run affiché avant activation du bouton Importer, rapport créations/modifications/attentes.
- Catalogue réel versionné dans `donnees/imports/the-dream/catalogue.csv` : 225 lignes, 221 vendables, 39 catégories, 18 lignes de variantes neutres pour 9 vins, 4 attentes. Aucun article barré, recette ou stock initial.
- Tests dédiés : dry-run sans écriture, répétition idempotente, permissions, anon, isolation établissement, absence de mouvement de stock, exactitude du CSV et prix distincts des Mojito.

### État réel et identifiants

L'environnement Codex ne possède ni session `patrondream`, ni secret GitHub/Supabase, ni authentification GitHub CLI. Il n'a donc pas pu lire ni modifier la production. `client_id`, `etablissement_id`, Hub(s), modules et membres de The Dream restent **à relever dans la session protégée** ; aucun identifiant n'est inventé. L'import production est **NON** et la vérification `patrondream` est **NON**.

### Éléments volontairement exclus ou en attente

- Toutes les anciennes lignes barrées sont absentes.
- Sodabi, Vin de palme spécial Sud et Tcham spécial Nord : sans prix, inactifs, non importés comme articles vendables.
- Frites de pomme de terre : prix contradictoire, inactive et en attente.
- Les formats de vins restent `Tarif 1` / `Tarif 2` ; le client devra confirmer leurs libellés métier.
- Options de planche (2 ou 3 accompagnements) : non créées ; le moteur Salle ne possède pas encore de groupes d'options. Les descriptions conservent le besoin. Une évolution générique reste à concevoir après le rendez-vous.
- Les boissons sont marquées sans suivi de stock tant qu'aucun stock initial/unité réelle n'est confirmé ; cela évite de transformer « inconnu » en zéro réel.

### Production et prochaines actions

1. Revue/CI puis fusion de la PR.
2. Actions → Sauvegarde de la base.
3. Actions → Déploiement de la base, d'abord `simulation`, puis `appliquer` avec `JE CONFIRME`.
4. Connexion `patrondream` : relever et vérifier Client → Établissement → Hub, modules, rôle et accès Hub.
5. Dans le bon établissement uniquement, Articles → Importer → `catalogue.csv`; vérifier le rapport avant confirmation.
6. Contrôler après import : 221 articles actifs si aucun existant n'est réutilisé, 39 catégories si aucune préexistante, 4 attentes ; comparer aussi les totaux des autres établissements avant/après.
7. Smoke tests Salle, Cuisine, Caisse, tablette/téléphone et audit ; documenter les identifiants et nombres réellement appliqués.

Ne pas déclarer la production terminée avant ces étapes. Les fichiers modifiés, commandes, résultats, commit et PR sont également consignés en tête de `ai/CODEX/JOURNAL.md`.

## HANDOFF CLAUDE — 2026-10-05 — The Dream en service (tâche 009)

### Diagnostic
`importer_catalogue` introuvable en production : la migration `20261003000017` est sur `main` mais **jamais déployée**
(le dernier « Déploiement de la base » réussi date du commit 1179483 = migration 16 ; la PR #3 a été fusionnée après,
Cloudflare a publié l'écran). Rien d'autre (grants, signature, RLS) n'était en cause : la signature
`(p_etablissement_id uuid, p_lignes jsonb, p_simulation boolean)` correspond exactement à l'appel de l'écran.

### Livré (branche `claude/inspiring-shannon-wiaa2q`)
- Migration `20261005000001_restaurant_service_categories.sql` (incrémentale, aucune donnée réécrite sauf
  `rest_commandes.pris_par` rempli avec `serveur_id`) : 4 permissions, catégories (description, archivage,
  restauration, ordre, déplacement en masse), disponibilité, `rest_affectations`, `rest_transferts_serveur`,
  `ouvrir_commande_restaurant` (serveur affecté), `ajouter_lignes_restaurant` (indisponible/épuisé refusés, variante dans
  le libellé), `statistiques_serveurs_restaurant`, `tableau_de_bord_restaurant` enrichi, `importer_catalogue` v2,
  `notify pgrst`.
- Écrans : `src/modules/restaurant/Salle.jsx`, `Serveurs.jsx` (nouveau), `commun.js` ; `src/modules/articles/Articles.jsx`,
  `Categories.jsx` (nouveau) ; ordre des catégories en caisse ; correctifs CSS (carte « attention », recherche).
- Catalogue `donnees/imports/the-dream/catalogue.csv` + `README.md` (divergences, exclusions, à confirmer).
- Tests : `tests/restaurant_service.test.js` (18), `tests/import_csv_catalogue.test.js` (import réel du fichier),
  `tests/noyau.test.jsx` (écran), `tests/migrations.test.js` ; parcours Chromium `scripts/parcours_restaurant.cjs`
  (ajouté à la CI, bloquant).
- Workflow `verifier-etablissement.yml` + `scripts/verifier_etablissement.sql` (lecture seule).
- SOP 59 (import d'un catalogue client), SOP 49 et 12 complétées, RESTAURANT, SECURITE, MODELE_DONNEES, DECISIONS.

### À faire, dans cet ordre (humain : Juste)
1. CI verte sur la PR.
2. Actions › **Sauvegarde de la base**.
3. Actions › **Déploiement de la base** › branche de la PR (ou `main` après fusion) › `simulation` : la liste doit
   être exactement `20261003000017_import_catalogue_restaurant` et `20261005000001_restaurant_service_categories`.
4. Même workflow › `appliquer` › `JE CONFIRME`.
5. Fusionner la PR (Cloudflare publie l'écran) — après l'étape 4, jamais avant.
6. Actions › **Vérifier un établissement** (`dream`, `patrondream`) : relever client, établissement, Hub(s), modules,
   rôle et droits ; noter les volumes.
7. Connexion `patrondream` › Articles › Importer › `catalogue.csv` : le rapport doit nommer The Dream et annoncer
   218 créations, 10 à confirmer, 20 variantes, 29 catégories, 0 avertissement (si le catalogue est vide). Cocher, Importer.
8. Relancer « Vérifier un établissement » : autres établissements inchangés. Smoke test SOP 14 : Salle › affecter un
   serveur › ouvrir une table › plat + boisson › Envoyer › Écran cuisine (Cuisine, Bar) › Addition › reçu › Ventes ›
   Salle › ⋯ › Serveurs et activité.
9. Faire confirmer au client la liste « À confirmer » du README du catalogue.
