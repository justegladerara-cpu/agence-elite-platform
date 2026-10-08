# Journal de Codex (développeur)

## 2026-10-08 — Tâche 013 : corrections poussées, vérifications externes bloquées

- Main mis à jour et confirmé à6cf7517b54e941a0c7a78e1997bb9eb9cd796526 ; lectures obligatoires/SOP effectuées ; aucune branche tierce modifiée. PR #7 relue (\n littéral), fermeture seulement proposée ; PR #11 source rendue hors dépôt avec quittance fictive, aucune migration/RPC réelle ; PR #9 intouchée.
- Registre17 constats documenté avant correction,14 corrections locales ; docs/AUDIT_2026-10.md et AUDIT_2026-10_PREUVES.md portent preuves/limites/statuts. Sept branches par thème poussées : tests-fictifs,restaurant-tests,chargement-pages,impression,contrats-api,lint-ci,securite-base ; une branche diagnostic pour rapport/consignes. Prérequis fictif intégré à chaque thème.
- Tests : trois suites initiales478/478 ; Restaurant avant4échecs/11réussites reproduit les deux erreurs du mandat, après15/15 ; aucun test désactivé/sauté ou assertion métier affaiblie. Vraie cause : tri positional_UUID après horodatages égaux et état partagé. CSV réel retiré des entrées de test, fichier client intact.
- Sécurité PGlite : attaques directes et helper hors périmètre refusés après correction, RPC légitimes conservées ; catalogueRLS/SD/triggers/FK/vues +exceptions documentées. Deux nouvelles migrations réservées20261012000001/2 seulement, aucune appliquée. Modèle documentaire compilé/rejoué (avant fonctionabsente), migrations historiques inchangées. Contrôles catalogue CI prévus sur PostgreSQL réel local read only, mais exécution réelle non prouvée.
- API : six tris invalides corrigés, validation explicite commune ; contrats AST/RPC/paramètres/relations après migrations. ESLint10.12.0 minimal hooks/no-unused-vars, lint0 ; checkout7.0.1/setup-node7.1.0 vérifiés par tags/README officiels, Node24.
- Combinaison localee50a8a9 : npmci, lint0,509/509 tests56 fichiers ; buildstandard/démo réussis, tousJS<=500000octets, local488.90kB. Conflits d’intégration résolus et lockfile normalisé ; branche de vérification seulement locale.
- Navigateur :1634 relevés métier/42éditeur aux1360/820/390px, zéroerreur visible/débordement ; gardes motdepasse temporaire respectées via changements normaux fictifs uniquement. Chaque action de sous-route n’est pas couverte. Impression réelle des composants ticket/facture +quittance source fictive conforme aperçu/PDF. Inter locale et favicon suppriment les erreurs réseau initiales ; avertissements fournisseur PGlite restent visibles.
- Derniers parcours combinés : Commerce et Restaurant réussis sur le preview figé4173, aucune erreur console ; ticket/facture PDF conformes. Logs et empreintes enregistrés dans les preuves.
- Accès : Gitfetch/push OK ; ghPR/REST/GraphQL/Actions Forbidden, aucune PR créée ni run site/pilote lancé ; Supabase lecture absent ; public.ecr.aws CONNECT403 ; site officiel CONNECT403 proxy (pas réponse site). Avis et50 migrations production seulement transmis, non relus. Aucun lienrun/CI/base/prod inventé.
- Production : aucune donnée client/prix/stock/activation modifiée ; aucune migration/fusion/publication. Reprise obligatoire : accès effectifs, revueprod, PR/CI, séquence base protégée exacte sauvegarde→simulation→JE CONFIRME→vérification puis fusion dépendante, contrôlesPages/site/pilote après chaque fusion. Décisions Juste enregistrées.

## 2026-10-08 — Tâche 013 : audit complet, état initial
- Mandat de Juste reçu ; main actualisé à `6cf7517`, branche Codex dédiée, aucune branche tierce modifiée.
- Audit consigné avant corrections dans `docs/AUDIT_2026-10.md` ; nouvelle tâche 013.
- `npm ci` réussi après EPERM sandbox ; trois suites : 478/478 chacune ; builds standard/démo réussis avec avertissements.
- Catalogue SQL local reconstruit : 108 tables avec RLS, 397 fonctions, SD avec search_path vide, deux vues security_invoker ; 190 FK sans index couvrant à traiter. Analyse AST de 376 appels API statiques : aucun nom/paramètre absent détecté.
- Blocages : API GitHub REST/GraphQL Forbidden, aucun connecteur Supabase exposé. PR/CI/advisors/production non vérifiés ; aucune écriture production.

## 2026-10-03 — Tâche 008 : onboarding The Dream (préparation sécurisée)
- Gouvernance : tâche 008 créée ; `AGENTS.md`, registre des tâches, décisions et état projet alignés sur le dépassement du Lot 1 sans supprimer l'historique.
- Import générique : migration `20261003000017_import_catalogue_restaurant.sql`, dry-run obligatoire, références idempotentes, variantes/ordre/disponibilité, permission `articles.gerer`, audit existant et aucun stock initial.
- Catalogue : `donnees/imports/the-dream/catalogue.csv`, 225 lignes tarifaires, 221 actives, 39 catégories, 18 lignes de variante, 4 attentes sans prix ; lignes barrées exclues, recettes et stocks non inventés.
- Interface : aperçu du rapport avant import dans Articles ; colonnes description, variante, actif, ordre, poste et motif d'attente reconnues.
- Tests ajoutés : CSV, dry-run, idempotence, permissions/anon, isolation établissement et absence de mouvement de stock.
- Commandes : tests ciblés (4/4), `npm test` (45 fichiers, 445/445), `npm run build` (succès, avertissement habituel de taille PGlite), `npm ci` (0 vulnérabilité), `git diff --check` (succès). `npm run test:e2e` reste impossible localement car le binaire Chromium Playwright n'est pas installé ; le parcours demeure bloquant en CI.
- Production : non appliquée. Aucun accès GitHub CLI, secret de base ou session `patrondream` dans l'environnement ; IDs Client/Établissement/Hub non inventés. Action restante détaillée dans `docs/HANDOFF.md`.
- Question pour Claude : après le rendez-vous, concevoir les groupes d'options génériques (2/3 accompagnements des planches) et confirmer avec le client les libellés des doubles tarifs de vins et le prix des frites.

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
