# Tâche 001 — Fondations et modèle de données

## Contexte
Ce dépôt ne contient que de la documentation. Le socle est validé : lis `docs/ARCHITECTURE.md`, `docs/GLOSSAIRE.md`, `docs/MODELE_DONNEES.md` (**la référence de cette tâche**), `docs/SECURITE.md` et `docs/LOT1_PLAN.md`. On travaille en local uniquement : les tests SQL tournent sur **PGlite** (`@electric-sql/pglite`), sans Docker et sans base distante.

## Objectif
1. Disposer d'un outillage de test qui reconstruit une base vide à chaque test (shim Supabase + toutes les migrations dans l'ordre).
2. Créer, par migrations versionnées, toutes les tables du socle décrites dans `docs/MODELE_DONNEES.md`, avec leurs contraintes et la RLS activée (sans politique), puis le catalogue de départ.
3. Prouver le tout par des tests et une CI GitHub Actions.

## Fichiers concernés (à créer)
- `package.json`, `package-lock.json`, `.gitignore`, `vitest.config.js`
- `tests/sql/supabase_shim.sql`
- `tests/helpers/db.js`
- `supabase/migrations/20261001000001_socle_catalogue.sql`
- `supabase/migrations/20261001000002_socle_clients_etablissements.sql`
- `supabase/migrations/20261001000003_socle_membres.sql`
- `supabase/migrations/20261001000004_socle_parametres_journaux.sql`
- `supabase/migrations/20261001000005_donnees_catalogue.sql`
- `tests/structure.test.js`, `tests/contraintes.test.js`, `tests/catalogue.test.js`, `tests/migrations.test.js`
- `.github/workflows/ci.yml`
- `ai/CODEX/JOURNAL.md` (nouveau, ta première entrée)
- `ai/TACHES/README.md` : passe la ligne 001 à « à auditer »

## Contraintes
- Node 20, ESM (`"type": "module"`), dépendances de dev seulement : `vitest`, `@electric-sql/pglite` (version exacte épinglée). Script `npm test` = `vitest run`.
- Le SQL doit être du Postgres standard compatible Supabase (pas de syntaxe propre à PGlite) : les migrations seront rejouées plus tard avec la CLI Supabase.
- Noms en français, `snake_case`, exactement ceux de `docs/MODELE_DONNEES.md`. Si tu dois t'en écarter, explique pourquoi dans le Rendu.
- Clés étrangères en `on delete restrict`, sauf `profils.id` → `auth.users` en `on delete cascade`.
- Chaque table de `public` a `enable row level security` et **aucune politique** (les politiques arrivent à la tâche 002).
- Fonctions de trigger : `set search_path = public` (ou `''` avec des noms qualifiés).

## Travail demandé
1. **Shim** `tests/sql/supabase_shim.sql` (pour les tests seulement) :
   - rôles `anon`, `authenticated` (nologin) et `service_role` (nologin, `bypassrls`) ;
   - schéma `auth` avec la table `auth.users (id uuid primary key default gen_random_uuid(), email text unique)` ;
   - fonctions `auth.uid()` (lit `sub` dans `current_setting('request.jwt.claims', true)`, renvoie `null` si absent), `auth.role()` et `auth.jwt()` ;
   - `grant usage on schema public, auth` aux trois rôles ;
   - `alter default privileges in schema public grant all on tables to anon, authenticated, service_role` (idem pour les séquences et les fonctions), pour imiter Supabase. C'est la RLS qui doit protéger, pas l'absence de droits.
2. **Helper** `tests/helpers/db.js` :
   - `creerBase()` crée une nouvelle instance PGlite, applique le shim puis toutes les migrations de `supabase/migrations/` triées par nom, et la renvoie ;
   - `commeRole(db, role, userId, fn)` exécute `fn` dans une transaction avec `set local role <role>` et `set_config('request.jwt.claims', '{"sub": "<userId>", "role": "<role>"}', true)`.
3. **Migrations 1 à 4** : toutes les tables, colonnes, valeurs par défaut, contraintes `check`, clés primaires, clés étrangères et index utiles (sur chaque clé étrangère) de `docs/MODELE_DONNEES.md`, plus :
   - une fonction `fixer_modifie_le()` et son trigger sur chaque table qui a `modifie_le` ;
   - un trigger sur `etablissement_modules` qui refuse (exception claire, en français) un module non proposé par la solution de l'établissement ;
   - un trigger sur `etablissements` qui refuse toute modification de `solution_id` et de `client_id` ;
   - des triggers sur `evenements` et `journal_audit` qui refusent UPDATE et DELETE ;
   - sur `invitations` : contrainte « exactement une cible », contrainte `email = lower(email)`, index unique partiel « une invitation en attente par email et par cible ».
4. **Migration 5** : le catalogue de départ, exactement comme dans la section « Données de départ » de `docs/MODELE_DONNEES.md`. Elle doit être idempotente (`on conflict do nothing`).
5. **CI** `.github/workflows/ci.yml` : sur `push` et `pull_request`, Node 20, `npm ci`, `npm test`.

## Tests obligatoires (`npm test`)
- **migrations** :
  - les noms de fichiers respectent `^\d{14}_[a-z0-9_]+\.sql$` et sont uniques ;
  - deux bases neuves se construisent sans erreur ;
  - la liste des tables de `public` est exactement celle attendue (21 tables).
- **structure** :
  - chaque table de `public` a `relrowsecurity = true` ;
  - aucune politique n'existe ;
  - `anon` et `authenticated` (avec un utilisateur existant) lisent 0 ligne dans chaque table, alors que des données existent (insérées par le propriétaire) ;
  - leur INSERT dans `clients` est refusé.
- **contraintes** (un test par règle, chacun doit échouer de la bonne façon) :
  - statut invalide refusé sur `clients`, `etablissements`, `solutions` et `modules` ;
  - module hors solution refusé sur `etablissement_modules`, module proposé accepté ;
  - changement de `solution_id` refusé ;
  - invitation avec deux cibles, avec zéro cible, ou avec un email en majuscules refusée ; seconde invitation en attente identique refusée ;
  - `permissions_ajustees` qui n'est pas un objet refusé ;
  - permission dont le préfixe ne correspond pas au module refusée ;
  - UPDATE et DELETE refusés sur `evenements` et `journal_audit` ;
  - `modifie_le` mis à jour après un UPDATE ;
  - couleur d'identité invalide refusée.
- **catalogue** :
  - trois solutions avec leurs statuts, trois modules du socle et leurs dépendances, trois modules par défaut par solution ;
  - cinq rôles, cinq permissions, et les droits par rôle exacts ;
  - aucun module de nature `metier` ;
  - rejouer la migration 5 ne crée pas de doublon.

## Critères d'acceptation
- `npm ci && npm test` passe sur une machine propre et dans la CI de la PR (verte).
- Le schéma correspond à `docs/MODELE_DONNEES.md` ; tout écart est justifié dans le Rendu.
- Aucun accès possible pour `anon` et `authenticated` à ce stade.
- Le code et les messages sont en français ; il n'y a aucun secret.

## Ce qu'il ne doit pas faire
- Pas de politique RLS ni de fonction d'accès (`a_permission`…) : c'est la tâche 002.
- Pas de table métier (articles, ventes, contacts, stock…), ni de module Commerce, Restaurant ou Hôtel.
- Pas d'application front, pas de Supabase distant, pas de `supabase/config.toml` lié à un projet, pas de clé.
- Ne modifie pas les fichiers de `docs/` ni `ai/CLAUDE/`. Si la doc te semble fausse, signale-le dans le Rendu.
- Ne désactive, ne saute et ne supprime aucun test.

## Rendu (commentaire dans la PR)
1. Ce qui a été fait (liste courte).
2. Fichiers créés ou modifiés.
3. Commandes lancées et leurs résultats (sortie résumée de `npm test` : nombre de tests passés et échoués).
4. Écarts par rapport à la tâche ou à la doc, et pourquoi.
5. Questions pour Claude.
