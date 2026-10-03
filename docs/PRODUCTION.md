# Mise en production

Ce document décrit comment mettre la plateforme en ligne avec sa **propre** base
Supabase. Elle ne partage rien avec le CRM Agence Elite ni avec Kangourou.

Tant que rien n'est configuré, l'application tourne en **mode local** : base dans
le navigateur, données de démonstration fictives. Rien ne part sur Internet.

## 1. État de la production

| Élément | Valeur |
|---|---|
| Projet Supabase | `agence-elite-platform` (réf. `xrlfedosaqtffraadmgk`, région Paris `eu-west-3`, offre gratuite, organisation Agence Elite) |
| Configuration publique | `.env.production` (URL + clé *publishable* : faites pour le navigateur, aucun secret) |
| Secrets GitHub | `SUPABASE_DB_URL` (chaîne de connexion de la base ; si c'est la connexion directe, les workflows passent automatiquement par le « Session pooler », GitHub n'ayant pas d'IPv6), `SAUVEGARDE_PHRASE` (chiffrement des sauvegardes, gardée aussi hors de GitHub) |
| Site | https://agence-elite-platform.justegladerara.workers.dev (Cloudflare Workers, fichiers statiques, construit depuis `main`, voir §5) |

La clé `service_role` n'est utilisée nulle part. Aucun secret n'est écrit dans le
code, les commits ou les journaux.

## 2. Installer ou faire évoluer la base

Les migrations de `supabase/migrations/` sont la seule source du schéma. Elles ne
sont jamais modifiées après coup : chaque changement est une nouvelle migration.

1. GitHub → **Actions → Déploiement de la base → Run workflow**, mode `simulation` :
   les tests tournent puis la liste des migrations à appliquer s'affiche.
2. Relancer en mode `appliquer` avec la confirmation `JE CONFIRME`.

Chaque push est vérifié par la CI (`ci.yml`) : tests, build, parcours navigateur
bloquant de tous les domaines, reconstruction complète sur un Supabase neuf, pilote
par l'API avec test de concurrence sur le stock, puis sauvegarde et restauration
dans une base vierge avec comparaison table par table.

## 3. Pilote en production

GitHub → **Actions → Pilote en production → Run workflow**. Le script
`scripts/pilote_production.sh` crée des comptes fictifs (`…@pilote.agence-elite.fr`,
mot de passe aléatoire jamais affiché), déroule tout le parcours Commerce sur deux
établissements fictifs, vérifie l'isolation et les refus de sécurité, puis neutralise
les comptes (accès retiré, mot de passe détruit, compte bloqué). Les données fictives
restent rattachées au client « Pilote fictif <date> », facile à archiver.

## 3 bis. Démo et comptes

GitHub → **Actions → Démo et comptes → Run workflow** (mot de passe temporaire, masqué ; adresse du
super administrateur). Le script `supabase/demo/commerce_demo.sql` installe ou complète le client fictif
« Commerce Démo » (3 Hubs) et les comptes par identifiant (`Admin`, `Patrondemo`, `Userdemo`, et
l'identifiant `Justegladerara` sur le super administrateur existant), sans rien effacer ; il archive
aussi les clients « Pilote fictif ». Les comptes reçoivent un mot de passe **temporaire** que la base
oblige à remplacer à la première connexion.

## 4. Premier compte Agence Elite (super administrateur)

1. Ouvrir l'application en ligne, onglet **Créer mon compte**, avec l'adresse
   Agence Elite.
2. Dans Supabase → **SQL Editor**, coller `supabase/scripts/creer_super_admin.sql`,
   remplacer l'adresse, exécuter.
3. Se reconnecter (identifiant ou e-mail) : l'espace **Agence Elite** apparaît (tableau de bord,
   clients, Hubs, modules, comptes, offres). Les autres comptes se créent ensuite depuis **Comptes**.
4. Les tarifs sont déjà saisis (450 000 / 50 000 / 25 000 par mois / 150 000 par an
   XAF, support séparé) et se modifient dans **Offres et prix**.

## 5. Site (Cloudflare)

Le dépôt est relié à Cloudflare (Workers & Pages → projet `agence-elite-platform`,
mode « Worker » avec fichiers statiques). Chaque push sur `main` reconstruit le site
(`npm run build`) puis le publie selon `wrangler.jsonc` (dossier `dist`, application
monopage). Aucune variable à saisir : la configuration publique est dans
`.env.production`. Les en-têtes de sécurité (CSP, HSTS, anti-iframe) sont dans
`public/_headers`. Node 22 est fixé par `.node-version`.

Vérification : GitHub → Actions → **Pilote en production**, champ « site » = adresse
du site. Après le pilote, un navigateur ouvre le site, contrôle les en-têtes, refuse
un mauvais mot de passe, connecte un gérant fictif et affiche ses articles.
**Adresse du site** (workflow « Adresse du site ») : affiche le résultat de la
dernière construction Cloudflare.

La démo locale sans base se construit avec `npm run build:demo`.

Domaine personnalisé (facultatif) : projet Cloudflare → **Settings → Domains & Routes**
→ `app.agence-elite.fr` (le domaine doit alors être géré par Cloudflare, ou passer
par un CNAME chez LWS selon l'offre).

## 6. Comptes et e-mails

Supabase → **Authentication → URL Configuration** : *Site URL* = adresse publique du
site. Pour que les clients reçoivent les e-mails (confirmation, mot de passe oublié),
renseigner un SMTP dans **Authentication → Emails → SMTP Settings** (par exemple une
boîte LWS d'Agence Elite) : sans SMTP, Supabase n'envoie des e-mails qu'aux membres
de l'organisation.

## 7. Sauvegarde et restauration

**Sauvegarde automatique** : `sauvegarde.yml` tourne chaque nuit à 01:30 UTC
(et à la demande). Il exporte rôles, schéma et données, chiffre l'archive (AES-256,
`SAUVEGARDE_PHRASE`) et la garde 30 jours dans les artefacts GitHub. Tant que les
secrets n'existent pas, il ne fait rien. Supabase garde aussi ses propres
sauvegardes quotidiennes selon l'offre.

Recommandé : télécharger une sauvegarde par mois et la ranger hors de GitHub.

**Restaurer** (sur un projet Supabase neuf de préférence, jamais par-dessus la
production sans accord) :

1. GitHub → Actions → **Sauvegarde de la base** → la dernière exécution → artefact
   `sauvegarde-…` → télécharger `base-AAAA-MM-JJ.tar.gz.gpg`.
2. Déchiffrer et ouvrir :
   ```bash
   gpg --decrypt base-AAAA-MM-JJ.tar.gz.gpg > base.tar.gz   # demande SAUVEGARDE_PHRASE
   mkdir restauration && tar -xzf base.tar.gz -C restauration
   ```
3. Créer un projet Supabase neuf (ou utiliser une base vierge), puis :
   ```bash
   scripts/restaurer.sh restauration "postgresql://…connexion de la base cible…"
   ```
   Schéma et données sont rechargés en une seule transaction (en cas d'erreur, rien n'est appliqué) ;
   les déclencheurs de protection sont suspendus le temps du rechargement
   (`session_replication_role = replica`).
4. Marquer les migrations comme déjà appliquées sur le projet restauré (sinon le
   prochain déploiement voudrait les rejouer) :
   ```bash
   npx supabase migration repair --db-url "postgresql://…" --status applied $(ls supabase/migrations | cut -d_ -f1)
   ```
5. Vérifier, puis pointer `.env.production` vers le nouveau projet si c'est lui
   qui devient la production.

**Vérification automatique** : à chaque push, la CI sauvegarde la base du pilote,
la restaure dans une base Supabase vierge et compare chaque table
(`scripts/verifier_restauration.sh`). Lancée à la main, la sauvegarde de production
fait la même vérification sur la vraie base.

## 8. Journaux

- **Actions des utilisateurs** : table `journal_audit` (qui, quand, quoi, avant/après),
  non modifiable, lisible par Agence Elite (super administrateur).
- **Historique des licences** : table `licence_evenements`, non modifiable.
- **Technique** : Supabase → *Logs* (API, Auth, Postgres) ; Cloudflare →
  *Deployments* et *Builds* (journaux de construction) ; GitHub → *Actions* (CI, déploiements, sauvegardes).

## 9. Retour arrière

| Problème | Action |
|---|---|
| Mauvaise version du site | Cloudflare → projet → Deployments → ancienne version → **Rollback** |
| Mauvaise migration | Écrire une **nouvelle** migration correctrice (jamais d'édition ni de suppression d'une migration appliquée), la tester en local puis la déployer |
| Données abîmées | Restaurer la dernière sauvegarde sur un projet neuf, comparer, puis rapatrier ce qui manque après accord |

## 10. Procédure de mise en ligne (résumé)

1. Projet Supabase dédié et secrets GitHub (§1).
2. Déploiement de la base : simulation puis application (§2).
3. Sauvegarde manuelle avec vérification de restauration (§7).
4. Pilote en production (§3).
5. Site Cloudflare (§5), Site URL et SMTP (§6).
6. Compte Agence Elite super administrateur (§4), puis `docs/PROCESSUS_CLIENT.md`
   pour le premier client.
