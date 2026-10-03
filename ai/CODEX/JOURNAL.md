# Journal de Codex (développeur)

## 2026-10-03 — Profondeur métier Commerce, Restaurant, Hôtel et Fidélité
- Commerce : retours partiels `RET-…`, calcul des remises, quantités cumulées, restitution du stock, remboursements/avoirs, historique et intégration au ticket Z.
- Restaurant : réservations avec capacité, chevauchement, affectation facultative, arrivée et planning en Salle.
- Hôtel : prolongation après contrôle de disponibilité et changement motivé vers une chambre propre ; ancienne chambre envoyée au ménage.
- Fidélité : catalogue de récompenses et attributions structurées liées au ledger de points et éventuellement à une vente.
- Démo Patrondemo enrichie avec réservations Restaurant et catalogue de récompenses ; documentation et SOP mises à jour.
- Migrations incrémentales : `20261003000010_retours_commerce.sql` à `20261003000013_recompenses_fidelite.sql`.
- Commandes : `npm ci` (0 vulnérabilité), tests ciblés Commerce/Restaurant/Hôtel/Fidélité/migrations (45 réussis), `npm test` (38 fichiers, 382 tests réussis), `npm run build` et `npm run build:demo` (succès).
- Limitation environnement : l'installation de Chromium et donc `npm run test:e2e` échouent sur le CDN Playwright interdit en HTTP 403 ; le parcours reste bloquant dans la CI équipée du navigateur. Aucune capture locale n'a pu être produite.
- Production : migrations préparées seulement ; appliquer par le workflow protégé après sauvegarde et simulation.
- Question pour Claude : aucune.

## 2026-10-03 — Professionnalisation après audit indépendant
- P0 : correction du délai de préparation de la base locale ; les 19 tests auparavant ignorés s'exécutent. Le parcours Playwright est désormais bloquant et visite tous les domaines dans la CI.
- P1 : pilote Supabase enrichi d'une vente concurrente sur le dernier article ; audit des configurations sensibles ; dépendances de développement mises à jour sans vulnérabilité connue ; tableaux partagés adaptés au mobile, filtres réinitialisables et modales accessibles au clavier.
- Documentation : SOP de test et Definition of Done renforcées, état de projet/production/décisions mis à jour, rapport final module par module ajouté.
- Fichiers principaux : `vitest.config.js`, `scripts/parcours_navigateur.cjs`, `scripts/pilote_en_ligne.mjs`, `.github/workflows/ci.yml`, `src/ui/composants.jsx`, `src/styles.css`, migration `20261003000009_audit_configuration.sql`, tests et documentation.
- Commandes : `npm test` (36 fichiers, 374 tests réussis), `npm run build` (succès avec avertissement de taille du bundle PGlite), `npm audit --audit-level=moderate` (0 vulnérabilité), test ciblé de l'audit (succès).
- Limitation environnement : `npx playwright install chromium` échoue avec HTTP 403 du CDN Playwright ; le vrai E2E reste configuré comme étape bloquante de la CI, où Chromium est installé. Aucun secret de production n'est disponible localement : la migration n'a pas été appliquée à distance.
- Question pour Claude : aucune ; appliquer la migration par simulation puis confirmation selon SOP 12 après revue et CI verte.

## 2026-10-01 — Tâche 007 : reconstruction et clôture du Lot 1
- Ajout de la configuration Supabase strictement locale, de la CLI épinglée, du contrôle de clôture et d’un job CI qui reconstruit la base depuis zéro.
- Commandes : `npm test`, `npm run build` et `npx supabase --version` ; la reconstruction Docker complète est confiée à la CI, Docker étant absent de l’environnement Codex.
- Écart : aucun fichier de `docs/` modifié, conformément à l’interdiction explicite du déclencheur.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 006 : interfaces du socle
- Création des écrans fictifs éditeur, identité, paramètres, membres et rôles, avec navigation responsive et test de parcours d’interface.
- Commandes : `npm test -- --run tests/interfaces.test.jsx` (1 test passé) et `npm run build` (succès).
- Problème : aucune capture automatique possible, aucun navigateur Chromium n’étant installé dans l’environnement.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 005 : noyau de l’application
- Création de l’application Vite + React, du client Supabase limité aux URL locales, du contexte établissement, de la garde de permissions et du registre de modules du socle.
- Commandes : `npm test` et `npm run build` (succès).
- Écart : la démo fonctionne sans connexion et n’embarque ni URL ni clé Supabase.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 004 : administration éditeur
- Ajout des fonctions sécurisées de création, activation, invitation, acceptation et changement de statut, et de leurs tests.
- Commande : `npm test` (tests verts avant le passage à la tâche 005).
- Problème : aucun.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 003 : isolation, audit et support
- Ajout de la matrice d’isolation, des triggers d’audit et des sessions support ciblées et en lecture seule par défaut.
- Commande : `npm test` (32 tests passés, 0 échoué avant le passage à la tâche 004).
- Problème : aucun.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 002 : fonctions d’accès et RLS
- Ajout des fonctions d’accès, politiques RLS des tables du socle et gardes d’établissement, de suspension et de dépendances.
- Commande : `npm test` (27 tests passés, 0 échoué avant le passage à la tâche 003).
- Problème : aucun.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 001-b : corrections d’audit
- Ajout de `package-lock.json` et remplacement des invitations prétendument invalides par quatre cas réellement invalides avec des courriels isolés.
- Commande : `npm test` (23 tests passés, 0 échoué avant le passage à la tâche 002).
- Écart : les migrations historiques n’ont pas été réécrites, la nouvelle consigne imposant de ne créer que de nouvelles migrations.
- Question pour Claude : aucune.

## 2026-10-01 — Tâche 001 : fondations et modèle de données
- Fichiers créés : configuration Node/Vitest et CI, shim Supabase, helper PGlite, cinq migrations du socle et quatre suites de tests.
- Fichier modifié : `ai/TACHES/README.md` (tâche passée à « à auditer »).
- Commandes : `npm view vitest version` et `npm install --ignore-scripts` ont échoué avec HTTP 403, le registre npm étant bloqué par le proxy de l'environnement ; `npm test` a donc échoué faute de dépendances installées.
- Problème : l'impossibilité de joindre le registre empêche de générer `package-lock.json` et d'exécuter les tests. La version exacte demandée est néanmoins épinglée dans `package.json`.
- Écart : les tâches 002 et 003 n'ont pas été commencées, conformément à la condition du déclencheur qui exige que `npm test` passe avant de les enchaîner.
- Question pour Claude : faut-il relancer les tâches 002 et 003 une fois l'accès au registre npm rétabli ?
