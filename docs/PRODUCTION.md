# Mise en production

Ce document décrit comment mettre la plateforme en ligne avec sa **propre** base
Supabase. Elle ne partage rien avec le CRM Agence Elite ni avec Kangourou.

Tant que rien n'est configuré, l'application tourne en **mode local** : base dans
le navigateur, données de démonstration fictives. Rien ne part sur Internet.

## 1. Ce qui demande l'accord d'Agence Elite

| Élément | Coût | Qui le fait |
|---|---|---|
| Projet Supabase dédié `agence-elite-platform` | Gratuit si une organisation gratuite a une place libre, sinon offre payante Supabase | Juste |
| Projet Cloudflare Pages | Gratuit | Juste (ou Claude avec un accès Cloudflare) |
| Envoi d'e-mails (SMTP) pour confirmer les comptes | Gratuit jusqu'à un volume (ex. Brevo, Resend) | Facultatif |
| Sous-domaine (ex. `app.agence-elite.fr`) | Inclus chez LWS | Juste (DNS LWS) |

L'organisation Supabase gratuite d'Agence Elite est déjà pleine (CRM + Kangourou).
Il faut donc soit libérer une place, soit créer une autre organisation gratuite,
soit passer à une offre payante. **C'est une décision d'Agence Elite.**

## 2. Créer le projet Supabase

1. supabase.com → **New project**, nom `agence-elite-platform`, région la plus proche
   des clients (ex. `eu-west-3` Paris). Noter le mot de passe de la base dans un
   gestionnaire de mots de passe (jamais dans Git).
2. **Authentication → URL Configuration** : *Site URL* = l'adresse publique de
   l'application (ex. `https://app.agence-elite.fr`), ajouter aussi l'adresse
   `*.pages.dev` dans *Redirect URLs*.
3. **Authentication → Providers → Email** : laisser l'inscription par e-mail activée.
   Garder « Confirm email » activé dès qu'un SMTP est configuré (sinon la limite
   d'envoi gratuite de Supabase est très basse).
4. **Project Settings → API** : relever l'URL du projet et la clé publique
   (*anon* / *publishable*). La clé `service_role` ne sert **jamais** dans
   l'application ni dans GitHub.
5. **Project Settings → Database → Connection string → Session pooler** : copier la
   chaîne `postgresql://…` avec le mot de passe. C'est le secret `SUPABASE_DB_URL`.

## 3. Secrets GitHub

Dans le dépôt : **Settings → Environments → New environment** `production`
(ajouter Juste comme *Required reviewer* pour qu'aucun déploiement ne parte sans
son clic). Dans cet environnement, ajouter :

| Secret | Valeur |
|---|---|
| `SUPABASE_DB_URL` | chaîne « Session pooler » du projet |
| `SAUVEGARDE_PHRASE` | longue phrase secrète, conservée aussi **hors de GitHub** |

Aucun secret n'est écrit dans le code, les commits ou les journaux.

## 4. Installer la base (migrations)

Les migrations de `supabase/migrations/` sont la seule source du schéma. Elles ne
sont jamais modifiées après coup : chaque changement est une nouvelle migration.

1. GitHub → **Actions → Déploiement de la base → Run workflow**, mode `simulation` :
   les tests tournent puis la liste des migrations à appliquer s'affiche.
2. Relancer en mode `appliquer` avec la confirmation `JE CONFIRME`.
3. Le même workflow sert pour chaque nouvelle version du schéma.

Chaque push est déjà vérifié par la CI (`ci.yml`) : tests, build, et
reconstruction complète de la base sur un Supabase neuf.

## 5. Premier compte Agence Elite (super administrateur)

1. Ouvrir l'application en ligne, onglet **Créer mon compte**, avec l'adresse
   Agence Elite.
2. Dans Supabase → **SQL Editor**, coller `supabase/scripts/creer_super_admin.sql`,
   remplacer l'adresse, exécuter.
3. Se reconnecter : le menu **Agence Elite** apparaît (clients, licences, offres).
4. Dans **Offres et prix**, saisir les vrais prix (ils sont à 0 au départ).

## 6. Héberger l'application (Cloudflare Pages)

Workers & Pages → **Create → Pages → Connect to Git** → dépôt
`agence-elite-platform`, branche `main`.

| Réglage | Valeur |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable `NODE_VERSION` | `20` |
| Variable `VITE_SUPABASE_URL` | URL du projet Supabase |
| Variable `VITE_SUPABASE_ANON_KEY` | clé publique du projet |
| Variable `VITE_AUTORISER_SUPABASE_DISTANT` | `oui` |

Sans ces trois variables, le site publié est la **démo locale** (utile pour
montrer le produit sans base). L'application refuse toute autre adresse que
`https://<projet>.supabase.co` et ne se connecte à un Supabase hébergé que si
`VITE_AUTORISER_SUPABASE_DISTANT=oui`.

Chaque push sur `main` redéploie le site. Les en-têtes de sécurité sont dans
`public/_headers`.

Domaine personnalisé : Pages → **Custom domains** → `app.agence-elite.fr`, puis
chez LWS un enregistrement `CNAME app → <projet>.pages.dev`.

## 7. Sauvegarde et restauration

**Sauvegarde automatique** : `sauvegarde.yml` tourne chaque nuit à 01:30 UTC
(et à la demande). Il exporte rôles, schéma et données, chiffre l'archive (AES-256,
`SAUVEGARDE_PHRASE`) et la garde 30 jours dans les artefacts GitHub. Tant que les
secrets n'existent pas, il ne fait rien. Supabase garde aussi ses propres
sauvegardes quotidiennes selon l'offre.

Recommandé : télécharger une sauvegarde par mois et la ranger hors de GitHub.

**Restaurer** (sur un projet Supabase neuf de préférence, jamais par-dessus la
production sans accord) :

```bash
gpg --decrypt base-AAAA-MM-JJ.tar.gz.gpg > base.tar.gz   # demande la phrase secrète
mkdir restauration && tar -xzf base.tar.gz -C restauration
psql "$URL_BASE_CIBLE" -f restauration/roles.sql
psql "$URL_BASE_CIBLE" -f restauration/schema.sql
psql "$URL_BASE_CIBLE" -c "set session_replication_role = replica" -f restauration/donnees.sql
```

`session_replication_role = replica` évite que les déclencheurs de protection
(journal d'audit, ventes non modifiables) ne bloquent le rechargement des données.

Tester une restauration au moins une fois avant le premier vrai client.

## 8. Journaux

- **Actions des utilisateurs** : table `journal_audit` (qui, quand, quoi, avant/après),
  non modifiable, lisible par Agence Elite (super administrateur).
- **Historique des licences** : table `licence_evenements`, non modifiable.
- **Technique** : Supabase → *Logs* (API, Auth, Postgres) ; Cloudflare Pages →
  *Deployments* (journaux de build) ; GitHub → *Actions* (CI, déploiements, sauvegardes).

## 9. Retour arrière

| Problème | Action |
|---|---|
| Mauvaise version du site | Cloudflare Pages → Deployments → ancienne version → **Rollback** |
| Mauvaise migration | Écrire une **nouvelle** migration correctrice (jamais d'édition ni de suppression d'une migration appliquée), la tester en local puis la déployer |
| Données abîmées | Restaurer la dernière sauvegarde sur un projet neuf, comparer, puis rapatrier ce qui manque après accord |

## 10. Procédure de mise en ligne (résumé)

1. Accord sur le coût Supabase → créer le projet (§2).
2. Environnement GitHub `production` + secrets (§3).
3. Déploiement de la base : simulation puis application (§4).
4. Cloudflare Pages avec les variables (§6).
5. Créer le compte Agence Elite et le passer super administrateur (§5).
6. Saisir les prix des offres, puis dérouler `docs/PROCESSUS_CLIENT.md` pour le
   premier client.
7. Lancer une sauvegarde manuelle et vérifier qu'elle se restaure (§7).
