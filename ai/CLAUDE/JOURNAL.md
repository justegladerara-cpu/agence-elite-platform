# Journal de Claude (manager / architecte)

## 2026-10-08 — Adresses web des clients (super admin) et connecteur IA
- Demande de Juste : créer facilement des adresses comme thedream.agence-elite.fr depuis le compte super admin, et via l'IA (« Les deux »).
- Page `#/editeur/adresses` (menu « Adresses web », super admin seulement) + action « Créer son adresse web » sur chaque établissement.
- Fonctions Cloudflare Pages : `functions/api/adresses.js` (contrôle `est_super_admin()`), `functions/mcp.js` et `functions/mcp/[[chemin]].js` (connecteur copié dans `serveur/connecteur/`).
- Aucune migration. Correctif de la PR #8 (`lotEnCours` / `lotErreur` dans Articles) repris pour que la CI passe ; sans effet une fois la PR #8 fusionnée.
- Vérifié : `npm test` (tous verts), `npm run build`, `npm run build:demo`, parcours navigateur (aucune erreur console). L'API Cloudflare n'est testée qu'avec une fausse API.
- Reste à Juste : réglages uniques de `docs/DEPLOIEMENT.md` §E (CNAME `*` chez LWS, jeton Cloudflare, 2 secrets, redirection Supabase).

## 2026-10-08 — Finalisation de la PR #4 « The Dream en service » (nouvelle session Claude Code)
- PR #4 fusionnée par Juste (ChatGPT) : `c8b40dc`. Pas de seconde fusion, aucune migration réappliquée, aucune écriture SQL directe.
- Vérifié : résultat de fusion testé en local avant la fusion (465/465, `build`, `build:demo`, parcours Chromium général et Restaurant : tablette et téléphone compris, aucune erreur console).
- CI `main` verte (37725059744) ; Cloudflare Pages + Workers `success` sur `c8b40dc` (37726081940) ; base « up to date » en simulation (37725217791) ; pilote 76/76 + site 7/7 sur saas.agence-elite.fr (37726084336) ; The Dream en lecture seule inchangé (37725544471).
- Constaté : le pilote ne couvre pas le Restaurant ; The Dream reste en solution `commerce` sans Salle ni Cuisine ; catalogue non importé.
- Reste à Juste : décision Salle / Cuisine pour The Dream, accord pour le dry-run puis l'import du catalogue.

## 2026-10-02 — Mission 7 phases (audit, éditeur, équipe, licences, production, pilote, processus)
- 5a21247 : audit offensif, 9 défauts corrigés (TRUNCATE, triggers, séquences, NaN, annulation après clôture, etc.), 30 tests.
- 399f1c2, 619d8c0 : licences (essai 30 jours, mensuel, annuel, acquisition, suspension, grâce 7 jours), invitations et équipe avec garde-fous, mode support compatible Supabase, espace Agence Elite, import d'articles, mise en service, durcissements.
- e5fd86a : préparation production (garde Supabase hébergé, workflows de déploiement et de sauvegarde, `docs/PRODUCTION.md`).
- Pilote fictif à deux établissements et documents de processus client.
- Vérifié : tests complets, build, parcours navigateur éditeur → client → licence → responsable → caissier → mise en service → support.
- Reste à Juste : créer le projet Supabase dédié (coût ou place gratuite), le projet Cloudflare Pages et les secrets ; saisir les prix des offres.
- Notés, non bloquants : `ouvrir_caisse` sans point de vente actif choisit la caisse principale même désactivée ; le rôle client `lecteur` a la même lecture que `dirigeant`.

## 2026-10-02 — Solution Commerce développée directement (Codex en pause)
- b454990 : correctifs de sécurité du socle (invitation sans email, client suspendu, portée `clients_lecture`, sessions support, membres).
- 3133b71 : base Commerce (9 modules, 21 permissions, 10 tables, 19 RPC, immuabilité, audit, tableau de bord) et 21 tests de parcours et d'isolation.
- 956deee : moteur local PGlite dans le navigateur et démo fictive.
- 6298d08 : écrans (caisse, ventes, reçus, articles, stock, Z, contacts, dépenses, tableau de bord, paramètres).
- Vérifié : `npm test` 81/81, `npm run build`, parcours complet dans Chromium (article → vente → reçu → annulation → stock rétabli → Z → dépense → tableau de bord, mobile compris), aucune erreur console.
- Bug trouvé au parcours : ouvrir un formulaire avant la fin du chargement plantait l'écran. Corrigé, et chaque écran a désormais une garde d'erreur.
- Reste : aperçu en ligne et Supabase hébergé (décision et action de Juste).

## 2026-10-02 — Audit du Lot 1 rendu par Codex (commit 3d453b2)
- `npm ci`, `npm test` (43/43), `npm run build` : OK. CI verte, y compris la reconstruction avec la CLI Supabase.
- Tests ciblés écrits par Claude : 3 défauts confirmés.
  - Un compte sans email peut accepter n'importe quelle invitation.
  - Un client suspendu reste modifiable.
  - `clients_lecture` : bug de portée, un membre ne voit pas son client.
- Autres écarts relevés :
  - l'acteur des événements peut être usurpé ;
  - il manque l'ouverture et la fermeture des sessions support ;
  - le super admin lit des données hors du mode support ;
  - un gérant peut ajouter un membre sans invitation ;
  - `permissions_ajustees` n'est pas typé ;
  - le CSS est minifié ;
  - les tâches 002 à 007 sont dans un seul commit.
- Tâche corrective L1-C envoyée dans la PR n°1. Lot 1 non validé.

## 2026-10-01 — Démarrage du Lot 1
- Dépôt initialisé avec la documentation de référence (architecture validée, glossaire, modèle de données, sécurité, décisions, plan du Lot 1) et les règles `AGENTS.md`.
- Choix de test : PGlite et un shim Supabase. J'ai vérifié que PGlite gère les rôles, la RLS, `SET LOCAL ROLE` et les claims JWT via `set_config`, ce qui permet de tester sans Docker.
- Tâche 001 confiée à Codex : fondations et modèle de données.
- Contraintes rappelées : pas de CRM, pas de production Kangourou, pas d'Elite Hôtel, pas de Supabase distant, pas de module métier.

## 2026-10-05 — Tâche 009 : The Dream en service (catalogue relu sur photos, catégories, serveurs)
- Diagnostic : `importer_catalogue` absente en production car `20261003000017` n'a jamais été déployée (dernier déploiement de la base sur 1179483).
- Migration `20261005000001_restaurant_service_categories.sql` : catégories administrables, disponibilité, affectations serveur ↔ table historisées, transferts motivés, statistiques par serveur, tableau de salle enrichi, import v2 dédoublonné.
- Catalogue relu sur les 6 photos agrandies : 228 lignes, 218 vendables, 10 à confirmer, 20 variantes, 29 catégories ; 16 prix de spiritueux corrigés, divergences avec la transcription du propriétaire documentées (photo retenue).
- Écrans Salle (filtres, Mes tables, affectation, service en cours), Serveurs, commande (transfert, épuisé, barre mobile), Articles (Catégories, sélection multiple, rapport d'import).
- Commandes : `npm test` (voir rapport de la PR), `npm run build`, `npm run build:demo`, `node scripts/parcours_navigateur.cjs` et `node scripts/parcours_restaurant.cjs` avec Chromium local (verts, aucune erreur console).
- Non fait faute d'accès : application en production, vérification de The Dream et de `patrondream`, import réel (procédure prête, voir HANDOFF).
