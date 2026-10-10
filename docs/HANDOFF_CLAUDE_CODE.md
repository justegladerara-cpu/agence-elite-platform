# Passation Claude Code → nouvelle session Claude Code

Rédigé le 2026-10-08 par la session Claude Code qui a développé la plateforme (environnement : session cloud Claude Code
dans le Projet claude.ai « Elite Management »). Tout ce qui est marqué **vérifié** l'a été le 2026-10-08 ; ce qui est
**déduit** ou **non vérifié** est dit comme tel. Aucun secret n'est écrit ici : seulement des noms.

Fichiers liés : [`CLAUDE.md`](../CLAUDE.md) (résumé lu automatiquement), [`DEPLOIEMENT.md`](DEPLOIEMENT.md) (procédures
de mise en ligne pas à pas), [`PRODUCTION.md`](PRODUCTION.md), [`SOP/README.md`](SOP/README.md),
[`HANDOFF.md`](HANDOFF.md) (passations par mission, dont The Dream).

---

## 0. SI TU ES UNE NOUVELLE SESSION CLAUDE CODE, COMMENCE ICI

Dans cet ordre, **sans rien modifier** :

1. Lire ce fichier en entier, puis [`DEPLOIEMENT.md`](DEPLOIEMENT.md).
2. Lire [`PROJECT_STATE.md`](PROJECT_STATE.md) puis [`DECISIONS.md`](DECISIONS.md) (les entrées récentes sont en bas).
   Attention : sur `main`, `PROJECT_STATE.md` date du 2026-10-03 ; la vérité au 2026-10-08 est au §45 ci-dessous.
3. Lire `AGENTS.md` (règles écrites pour Codex, valables aussi pour toi) et [`SOP/32`](SOP/32_REGLES_POUR_LES_IA.md),
   [`SOP/31`](SOP/31_DEFINITION_OF_DONE.md).
4. Lire la tâche active : `ai/TACHES/` (008 sur `main`, 009 sur la branche de la PR #4) et le haut de
   `ai/CLAUDE/JOURNAL.md` et `ai/CODEX/JOURNAL.md`.
5. Inspecter Git :
   ```bash
   git status
   git branch -a
   git log --oneline -15
   git remote -v
   git fetch origin && git log --oneline main..origin/main
   ```
6. Inspecter GitHub : PR ouvertes, dernières exécutions des workflows (voir §9 et §11). Une PR ouverte peut contenir du
   travail déjà appliqué en base (c'est le cas de la PR #4 au 2026-10-08, §45).
7. Vérifier que tu sais : lancer un workflow, lire ses journaux, lire les contrôles Cloudflare d'un commit (§12, §38).
8. Faire la checklist du §39 et dire à Juste ce que tu peux et ne peux pas faire.
9. Pour une tâche : trouver la SOP dans [`SOP/README.md`](SOP/README.md), la lire, **ensuite** coder.

---

## 1–3. Comment l'ancienne session travaillait, et pourquoi elle était autonome

### 1. Environnement réel de l'ancienne session (vérifié le 2026-10-08)

| Élément | Constat |
|---|---|
| Type de session | Claude Code **cloud** (conteneur Linux éphémère), lancé depuis un **Projet claude.ai** (« Elite Management »), un fil (thread) par mission |
| Dépôt | cloné dans `/home/claude/agence-elite-platform` par l'outil `add_repo` (accès `push`) puis `git clone` |
| Remote | `origin = https://github.com/justegladerara-cpu/agence-elite-platform` |
| Authentification Git | **par le proxy Git de la session** (identifiants injectés par l'environnement, aucun token dans le dépôt ni dans `~/.git-credentials`). `git fetch` / `git push` marchent sans rien configurer |
| Signature des commits | auteur `Claude <noreply@anthropic.com>`, commits signés par une clé SSH fournie par l'environnement |
| GitHub CLI `gh` | installé **mais non authentifié** (`gh auth status` : token invalide). L'ancienne session **n'utilisait pas `gh`** |
| Outils GitHub réellement utilisés | serveur MCP **GitHub** (outils `mcp__github__*`), qui agit **au nom du compte de Juste** (`justegladerara-cpu`, propriétaire du dépôt) : lire / créer / fusionner des PR, lancer un workflow (`actions_run_trigger`), lister les exécutions et lire leurs journaux (`actions_list`, `get_job_logs`), lire les contrôles d'un commit (`pull_request_read get_check_runs`, `get_check_run`) |
| Cloudflare | **aucun accès direct** (ni compte, ni API, ni `wrangler login`). Cloudflare est relié à GitHub : il construit à chaque push et publie un « check » sur le commit, lisible avec les outils GitHub |
| Supabase | **pas de Supabase CLI connectée à la production** dans le conteneur. Écritures en production **uniquement via GitHub Actions** (secret `SUPABASE_DB_URL` côté GitHub). Depuis peu, un **connecteur Supabase** (MCP `mcp__Supabase__*`, compte Supabase de Juste) est aussi disponible : utilisé le 2026-10-08 **en lecture seule** (liste des migrations, requêtes `select`) |
| Réseau | sortie par un proxy à liste blanche : `github.com` OK ; **bloqués** depuis le conteneur : `*.workers.dev`, `*.pages.dev`, `saas.agence-elite.fr`, `*.supabase.co`, CDN Playwright. Donc le site en ligne se vérifie **depuis GitHub Actions**, pas depuis le conteneur |
| Navigateur | Chromium préinstallé (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`), utilisable avec `CHROMIUM_PATH=…` pour les parcours E2E locaux |
| Node / npm | Node 22 (`/opt/node22`), `npm ci` fonctionne (registre npm autorisé) |
| `psql` | présent, mais la base de production est injoignable depuis le conteneur (réseau) |
| Autres outils du Projet | outils `mcp__hearthbot__*` (répondre dans le fil, statut, mémoire du projet), mémoire partagée du projet, dossier partagé `/mnt/project-files/` (rapports), connecteurs Gmail / Google Drive / Netlify (non utilisés pour la plateforme) |

### 2. Pourquoi « Ajoute telle fonctionnalité » allait jusqu'à la production

Chaque maillon a été vérifié :

1. **Dépôt attachable avec droit d'écriture** (`add_repo` → `push`) et `git push` direct via le proxy Git.
2. **Outils GitHub au nom du propriétaire** : la session pouvait elle-même créer et fusionner une PR, **lancer les
   workflows de production** et lire leurs journaux. C'est le maillon clé.
3. **Workflows déjà écrits** : CI complète, « Déploiement de la base » (simulation puis `appliquer` + `JE CONFIRME`),
   « Sauvegarde de la base », « Pilote en production », « Démo et comptes », « Adresse du site » (§11).
4. **Secrets déjà dans GitHub** (environnement `production`) : `SUPABASE_DB_URL`, `SAUVEGARDE_PHRASE`. La session n'a
   jamais eu besoin de leur valeur.
5. **Cloudflare relié à GitHub** : un push sur `main` publie le site ; un push sur une branche crée une préview. Le
   lien apparaît dans le check « Cloudflare Pages » du commit, lisible par les outils GitHub (§38).
6. **Configuration publique commitée** (`.env.production` : URL Supabase + clé *publishable*) : aucune variable à saisir
   dans Cloudflare.
7. **Tests exécutables localement** (PGlite : vraie base Postgres en mémoire, pas de Docker) et parcours navigateur
   avec le Chromium préinstallé.
8. **Mandat explicite de Juste** (missions « Vas-y pour TOUT », « fais tout par toi-même », « Je t'autorise tout »),
   enregistré dans la mémoire du Projet. Sans ce mandat, lancer `appliquer` en production n'aurait pas été fait.
9. **Connaissance accumulée** : SOP, décisions, pièges (ce document).

### 3. Ce qui se transmet par écrit et ce qui ne se transmet pas

**A — CONNAISSANCES (transmises par ce document et le dépôt)** : architecture, modules, décisions, SOP, erreurs déjà
rencontrées, historique, clients réels, The Dream, conventions, ordre « base puis site », habitudes de vérification.

**B — CAPACITÉS / ACCÈS (NE se transmettent PAS par documentation)** : chaque ligne doit être vérifiée par la nouvelle
session (§39, §46).

| Accès | Sur quoi | Pourquoi il faut | Comment vérifier qu'on l'a |
|---|---|---|---|
| Lecture du dépôt | `justegladerara-cpu/agence-elite-platform` | tout | `git clone` puis `git log -1` |
| Écriture Git | même dépôt, branches + `main` | commit / push | `git push -u origin <branche-de-test>` d'une branche vide puis la supprimer, ou `git push --dry-run` |
| API GitHub au nom de Juste (MCP GitHub ou `gh` authentifié) | PR, merge, Actions, journaux, checks | créer/fusionner une PR, **lancer les workflows de production**, lire le lien Cloudflare | lister les PR ; lister les exécutions de `ci.yml` ; lire les journaux d'un job ; lancer « Adresse du site » (sans risque) et lire son journal |
| Droit de lancer un workflow (`workflow_dispatch`) | les 5 workflows manuels | base, sauvegarde, pilote | lancer « Adresse du site » : sans écriture |
| Secrets GitHub (indirect) | environnement `production` | les workflows joignent la base | « Déploiement de la base » en `simulation` doit afficher « Base joignable via … » puis la liste des migrations |
| Lecture des checks Cloudflare | checks `Cloudflare Pages` et `Workers Builds` d'un commit | lien .dev, état du build | lire les checks du dernier commit de `main` |
| Connecteur Supabase (facultatif) | projet `xrlfedosaqtffraadmgk` | vérifier en lecture seule | `list_migrations` doit lister la même chose que `supabase/migrations/` |
| Réseau vers le site | `*.pages.dev`, `*.workers.dev`, `saas.agence-elite.fr` | vérifier soi-même | `curl -I` ; si bloqué, passer par le workflow « Pilote en production » (champ `site`) |
| Chromium | binaire local | E2E | `ls -d /opt/pw-browsers/chromium-*` ou `npx playwright install chromium` |
| Mandat de Juste | règles de travail | aller jusqu'en production sans redemander | le lire dans la mémoire du Projet ou le redemander une fois |

---

## 4. Dépôt réel inspecté (2026-10-08)

- `main` à `24b2c66` (fusion de la PR #3 Codex, 2026-10-03 18:47). Arbre propre.
- Branches distantes : `main`, `claude/inspiring-shannon-wiaa2q` (PR #4 **ouverte**), `codex/integrer-le-menu-du-the-dream-lounge`
  (PR #3 fusionnée), `codex/realiser-un-audit-technique-complet` (PR #2 fusionnée), `codex/tache-001-fondations` (PR #1 fusionnée).
- 47 migrations sur `main`, 48 sur la branche de la PR #4 ; **48 appliquées en production** (§45).
- `npm test` sur `main` : **45 fichiers, 445 tests, tous verts** (vérifié, 86 s). `npm run build` et `npm run build:demo` : OK
  (avertissement habituel de taille de bundle à cause de PGlite). Parcours navigateur `npm run test:e2e` avec le
  Chromium local : vert, « aucune erreur console » (vérifié).

## 5. Identité du projet

- **Agence Elite** : l'entreprise de Juste (services numériques, Afrique centrale, montants en XAF / FCFA). Domaine
  `agence-elite.fr` chez LWS.
- **Agence Elite Platform** (ce dépôt) : le **logiciel vendu aux clients** (SaaS). Nom commercial **pas encore choisi**
  (ne pas en inventer). Un seul socle ; une « solution » (Commerce, Restaurant, Hôtel, E-commerce, Services, RH) n'est
  qu'une **liste de modules**, jamais une application à part.
- **CRM interne d'Agence Elite** : **autre dépôt** (`justegladerara-cpu/agence-elite-crm`), autre projet Supabase
  (`mylgnsuoppplmfaanyze`), autre site (`crm.agence-elite.fr`, Cloudflare Pages `agence-elite-crm`, branche
  `claude/project-thread-j6wx9s`). C'est l'outil de prospection de Juste. **Ne jamais le modifier depuis ce travail**,
  ne jamais copier ses données, ne jamais le transformer en produit.
- Multi-client, multi-établissement, multi-Hub, white-label contrôlé (identité plateforme → client → établissement,
  palette fixe, aucune CSS libre), licences, permissions : voir §6.

## 6. Architecture métier

```
Agence Elite (éditeur, plateforme_admins : super_admin / admin / support)
└── Client (clients)                       aucune donnée métier
    └── Établissement (etablissements)     unité d'isolement ; 1 client, 1 solution (solution_id NE CHANGE JAMAIS)
        ├── Modules activés (etablissement_modules) ⊂ modules proposés par la solution (solution_modules)
        ├── Hubs (hubs) : lieux physiques ; 1 principal ; capacités vente / stock / caisse / transfert
        │   ├── Caisses (points_de_vente) et sessions de caisse
        │   └── Stock par Hub (vue stock_hubs = somme des mouvements)
        ├── Membres (etablissement_membres) : rôle + permissions_ajustees ; accès Hub (membre_hubs, aucune ligne = tous)
        └── Données métier : toujours avec etablissement_id (verrouillé)
Dirigeants (client_membres) : lecture de tous les établissements d'un client
Licences (licences, licence_evenements) : couche séparée ; offres et prix réglables (jamais en dur)
Comptes (comptes_connexion) : identifiant → compte Supabase Auth
```

**Niveaux d'un module** (tous doivent être vrais) : disponible au catalogue (`modules.statut`) → proposé par la solution
(`solution_modules`) → inclus dans l'offre → couvert par la licence → **activé** (`etablissement_modules`) → **permission**
de l'utilisateur (rôle ± `permissions_ajustees`). Fonction de synthèse : `mes_applications`.

**Hub** : stock, caisse et ventes sont **par Hub** ; l'établissement voit le consolidé. Un membre limité à des Hubs ne
lit que ces Hubs (RLS) et toute RPC vérifie l'accès au Hub (un transfert : les deux Hubs). Transferts et inventaires
ne se suppriment jamais (annulation avec motif). Un seul Hub = aucune notion de Hub à l'écran. SOP 26–28, 40.

## 7. Stack technique (vérifiée dans `package.json`)

React 19.1.1 · Vite 7.3.6 (+ `@vitejs/plugin-react` 5.0.4) · `@supabase/supabase-js` 2.57.4 · PostgreSQL 17 (Supabase,
région eu-west-3) · Supabase Auth · RLS partout · Vitest 4.1.11 + jsdom 27 + Testing Library · **PGlite 0.3.14** (Postgres
en mémoire pour les tests et le **mode local** de démo dans le navigateur) · Playwright 1.63.0 (parcours E2E) ·
Supabase CLI 2.119.0 (en devDependency, utilisée par la CI et les workflows) · Node 22 (`.node-version`, Cloudflare) /
Node 20 (workflows) · Cloudflare (Workers avec fichiers statiques **et** Pages, §12) · GitHub Actions.
Supabase Storage : **non utilisé** (images en `data:image` ou `https`).

## 8. Structure du dépôt

| Dossier | Rôle | À savoir |
|---|---|---|
| `supabase/migrations/` | **seule source du schéma** (tables, RLS, RPC) | nom `AAAAMMJJNNNNNN_sujet.sql`, numéro du jour ; jamais modifier un fichier fusionné ou appliqué |
| `supabase/demo/` | démo fictive (`commerce_demo.sql`, `modules_demo.sql`, `historique_demo.sql`) | idempotente ; jamais de vraie donnée |
| `supabase/scripts/` | scripts manuels (`creer_super_admin.sql`) | |
| `supabase/config.toml` | Supabase local (CI) | |
| `src/App.jsx`, `src/main.jsx` | coquille, connexion, routage | |
| `src/noyau/` | contexte (`espace.jsx`), routes, marque (white-label), `supabase.js`, `donnees/` (moteur local PGlite) | |
| `src/modules/<module>/` | un dossier par module, `manifeste.js` (pages du menu) + écrans | `src/modules/index.js` assemble les manifestes |
| `src/modules/editeur/` | espace Agence Elite (Super Admin) | routes dans `EspaceEditeur.jsx` |
| `src/auth/EcransAuth.jsx`, `src/noyau/pagesAuth.js` | écrans d'authentification administrables | catalogue de clés = `champs_pages_auth()` en base |
| `src/ui/` | composants partagés (`composants.jsx`) | design : `docs/DESIGN_SYSTEM.md`, SOP 07 |
| `src/public/` | pages publiques (boutique, suivi, site web) | |
| `tests/` | Vitest + PGlite ; `tests/sql/supabase_shim*.sql` imite Supabase (**jamais** dans une migration) | `tests/helpers/db.js` rejoue toutes les migrations |
| `scripts/` | parcours navigateur, pilote, sauvegarde/restauration, `url_base.sh` | |
| `.github/workflows/` | CI et workflows de production (§11) | |
| `docs/` | architecture, modules, production, **SOP** | |
| `ai/` | journaux Claude / Codex, tâches `ai/TACHES/` | |
| `donnees/imports/the-dream/` | catalogue réel de The Dream (`catalogue.csv`, `README.md`) | donnée client réelle : seulement pour l'import, jamais pour les tests de démo |
| `plateforme/` | ancien rapport | |
| `.env.production` / `.env.demo` | configuration **publique** du build | aucun secret ; `.env`, `.env.local` sont ignorés |
| `wrangler.jsonc`, `public/_headers` | publication Cloudflare Worker + en-têtes de sécurité | |

## 9. GitHub : le workflow exact

- Dépôt : `justegladerara-cpu/agence-elite-platform` (privé). Branche principale : **`main`** (c'est elle que Cloudflare
  publie). Pas de protection de branche constatée (l'ancienne session poussait directement sur `main`).
- Branches de travail : `claude/<sujet>` (Claude), `codex/<sujet>` (Codex, en pause).

Ce que faisait l'ancienne session (et ce qu'il faut refaire) :

```bash
git fetch origin && git checkout main && git pull origin main      # se mettre à jour
git checkout -b claude/<sujet>                                     # branche
# … modifier …
git diff --stat && git diff                                        # relire le diff
npm test && npm run build                                          # tester
git add <fichiers> && git commit -m "Sujet : ce qui change"        # message en français
git push -u origin claude/<sujet>                                  # pousser (réessayer 2/4/8/16 s si erreur réseau)
```

Puis, avec les outils GitHub (MCP) : créer la PR vers `main` (titre et description en français, avant/après) ;
lire les contrôles de la PR (`get_check_runs`) jusqu'à ce que `tests` et `reconstruction-supabase` soient `success` ;
récupérer le lien de préview Cloudflare (§38) ; si la PR contient une migration, faire la base **avant** la fusion
(§37) ; fusionner (`merge_pull_request`) ; vérifier que la CI du commit de fusion sur `main` est verte et que les
checks Cloudflare de `main` sont `success`.

Historique : du 2026-10-02 au 2026-10-03, l'ancienne session poussait **directement sur `main`** (sans PR). Cela
publiait le site **avant** la migration (fenêtre de quelques minutes). Recommandation désormais : **branche + PR**,
base appliquée depuis la branche, puis fusion.

Cas difficiles :
- `gh` non connecté : utiliser les outils MCP GitHub ; s'il n'y en a pas, demander à Juste `gh auth login` ou l'accès.
- Remote absent : `git remote add origin https://github.com/justegladerara-cpu/agence-elite-platform`.
- Push refusé (403) : l'accès en écriture manque → le dire à Juste, ne pas contourner.
- Push refusé (non fast-forward) : `git fetch origin && git merge origin/main` sur ta branche, résoudre, retester.
  **Jamais** `push --force` ni `rebase` sur `main`.
- Conflit sur une migration : ne jamais renommer une migration déjà appliquée ; renuméroter seulement une migration
  jamais appliquée (précédent : PR #2, migrations Codex renumérotées 10 à 14).
- Clone superficiel : `git fetch --depth=200 origin main` avant de pousser si le push est refusé en 413.

## 10. Mission réelle reconstituée : « Liens entre modules » (2026-10-03)

Demande de Juste (09:04) : intégrer Codex et relier les modules (devis ↔ opportunité, retours ↔ fidélité, temps projet).

| Étape | Ce qui a été fait | Preuve |
|---|---|---|
| Contexte | lecture PROJECT_STATE, DECISIONS, SOP 01/03/05/08 | |
| Inspection | tables et RPC existantes (`facturation`, `crm`, `fidelite`, `projets`, `agenda`) | |
| Conception | une fonction interne non exposée ; pas de nouvelle colonne (facture retrouvée par `origine_id`) ; déclencheurs | DECISIONS 2026-10-03 |
| Migration | `20261003000016_liens_modules.sql` (incrémentale, idempotente) | |
| RLS / permissions | réutilisées ; la personne qui facture n'a pas besoin du droit CRM | |
| Tests | tests dédiés `tests/liens_modules.test.js` + suite complète | |
| Build + E2E | `npm run build`, parcours navigateur | |
| Commit / push | commit `1179483` poussé sur `main` | CI run 37118854517 (verte) |
| Sauvegarde | « Sauvegarde de la base » lancée | run 37118853882 |
| Base | « Déploiement de la base » `appliquer` + `JE CONFIRME` | run 37119184899 |
| Démo | « Démo et comptes » | run 37119432256 |
| Pilote | « Pilote en production » avec `site` | run 37119456162 (vert) |
| Doc | `PROJECT_STATE` « 46 migrations en production » | commit `965a8d8` |
| Lien | site publié par Cloudflare depuis `main` | check Cloudflare du commit |

## 11. Workflows GitHub Actions (`.github/workflows/`)

| Nom | Fichier | Déclencheur | Entrées | Secrets (noms) | Fait | Succès / échec |
|---|---|---|---|---|---|---|
| CI | `ci.yml` | **automatique** à chaque push et PR | — | aucun | job `tests` : `npm ci`, `npm test`, `npm run build`, Chromium, `build:demo` + parcours navigateur bloquant. Job `reconstruction-supabase` : Supabase local neuf (`supabase start`, `db reset`), pilote complet, démo ×2, parcours mot de passe obligatoire, sauvegarde + restauration comparée | les deux jobs verts. Sur une PR, il y a 2 CI (push + pull_request) : un job `cancelled` n'est pas un échec de code, relancer |
| Déploiement de la base | `deploiement-base.yml` | **manuel** | `mode` = `simulation` / `appliquer` ; `confirmation` = `JE CONFIRME` | `SUPABASE_DB_URL` (env. `production`) | `npm test`, joint la base (`url_base.sh` passe au pooler IPv4), `supabase db push --dry-run`, puis si `appliquer`+`JE CONFIRME` : `supabase db push` | journal « Applying migration … » puis « Finished supabase db push ». Sans confirmation : erreur volontaire, rien n'est appliqué |
| Sauvegarde de la base | `sauvegarde.yml` | **automatique** chaque nuit `30 1 * * *` UTC (l'exécution réelle arrive souvent vers 07:15–07:55 UTC, retard de GitHub) **et manuel** | — | `SUPABASE_DB_URL`, `SAUVEGARDE_PHRASE` | export rôles + schéma + données, chiffré AES-256, artefact `sauvegarde-<run_id>` gardé 30 jours ; **en manuel**, restauration de contrôle dans une base vierge + comparaison | artefact présent ; en manuel, étape « Vérifier la restauration » verte |
| Pilote en production | `pilote-production.yml` | **manuel** | `site` (adresse à tester dans un navigateur ; vide = pas de navigateur) | `SUPABASE_DB_URL` | comptes fictifs `…@pilote.agence-elite.fr`, parcours Commerce sur 2 établissements fictifs, refus et isolation, concurrence de stock, puis neutralisation des comptes et archivage du client « Pilote fictif » ; si `site` : ouvre le site, contrôle en-têtes, mauvais mot de passe refusé, connexion gérant fictif | job vert |
| Démo et comptes | `demo-comptes.yml` | **manuel** | `mot_de_passe_temporaire` (masqué), `super_admin_email` | `SUPABASE_DB_URL` | installe / complète la démo fictive et les comptes `Admin`, `Patrondemo`, `Userdemo`, identifiant `Justegladerara` ; archive les « Pilote fictif » | affiche identifiants et nombre de Hubs |
| Adresse du site | `adresse-site.yml` | **manuel** | — | `github.token` (automatique) | attend la fin des checks Cloudflare du commit, affiche checks, statuts, déploiements, code HTTP du site workers.dev | lire le journal (§38). **Sans aucun risque** |
| Vérifier un établissement | `verifier-etablissement.yml` | **manuel** | `recherche`, `identifiant` | `SUPABASE_DB_URL` | **lecture seule** : client, établissement, Hubs, modules, membres, droits, volumes | **seulement sur la branche de la PR #4** tant qu'elle n'est pas fusionnée |

Les workflows qui touchent la base partagent `concurrency: deploiement-base` (démo, déploiement) : jamais deux à la fois.
Les journaux se lisent avec `get_job_logs` (outil GitHub) ou dans l'onglet Actions. Avertissement « Node.js 20 is
deprecated » : sans effet.

## 12–13. Cloudflare : comment le site part en ligne

Il y a **deux** projets Cloudflare branchés sur le même dépôt (constaté dans les checks GitHub) :

| Projet Cloudflare | Type | Adresse | Check GitHub |
|---|---|---|---|
| `agence-elite-platform` | **Worker** avec fichiers statiques (`wrangler.jsonc`) | https://agence-elite-platform.justegladerara.workers.dev | « Workers Builds: agence-elite-platform » |
| `agence-elite-saas` | **Pages** (préréglage Vite, `npm run build`, sortie `dist`) | https://agence-elite-saas.pages.dev et **https://saas.agence-elite.fr** (domaine personnalisé, CNAME chez LWS) | « Cloudflare Pages » |

Parcours : `git push` → GitHub prévient Cloudflare (application GitHub de Cloudflare, configurée par Juste) → chaque
projet lance `npm run build` (configuration publique lue dans `.env.production`) → publie `dist`.
- Push sur **`main`** = déploiement **de production** des deux projets.
- Push sur **une autre branche** = **préview Pages** : une adresse par commit (`https://<id>.agence-elite-saas.pages.dev`)
  et une adresse de branche (`https://<branche-tronquée>.agence-elite-saas.pages.dev`). Le Worker, lui, ne fait pas de
  préview utilisable.
- Variables Cloudflare : aucune nécessaire. Logs : tableau de bord Cloudflare (accès de Juste seulement) ; le lien vers
  les logs est dans le check.

**Incident connu — Workers Builds rouge sur les branches** : sur les commits de branche (PR #3, PR #4), le check
« Workers Builds: agence-elite-platform » est `failure` en 0 seconde, alors que « Cloudflare Pages » est `success` avec
le lien de préview. Ce rouge **n'est pas bloquant** : il n'empêche ni la CI ni la fusion, et sur `main` le même check est
`success` (vérifié le 2026-10-08 sur `24b2c66`). Ce qui est **bloquant** : `tests` ou `reconstruction-supabase` rouges,
« Cloudflare Pages » rouge, ou « Workers Builds » rouge **sur `main`**.

La vérification du domaine `saas.agence-elite.fr` n'a pas pu être faite depuis le conteneur (réseau bloqué) ; elle est
indiquée par Juste. Le workflow « Pilote en production » teste par défaut l'adresse workers.dev : passer
`https://saas.agence-elite.fr` dans le champ `site` pour tester le domaine.

## 14–16. Supabase

- Projet de production : `agence-elite-platform`, réf. **`xrlfedosaqtffraadmgk`**, eu-west-3, Postgres 17, offre
  gratuite, organisation « Agence Elite » (la même organisation contient le projet du CRM `mylgnsuoppplmfaanyze` : ne pas
  le toucher).
- Front : `.env.production` (URL + clé publishable). Sécurité = RLS + RPC, **la clé `service_role` n'est utilisée nulle part**.
- Auth : Supabase Auth (e-mail + mot de passe ; connexion par **identifiant** traduite par la RPC anonyme
  `resoudre_connexion`). SMTP configuré par Juste (expéditeur `contact@agence-elite.fr`). Site URL / redirections réglées
  dans Supabase par Juste.
- Écriture : **par fonctions RPC** (`security definer`, `search_path` fixé, permission vérifiée). Lecture : RLS.
- Storage : non utilisé.
- Local : tests sur **PGlite** (`tests/helpers/db.js` rejoue toutes les migrations + le shim) ; la CI démarre un vrai
  Supabase local (Docker du runner).
- Production : **indirectement par GitHub Actions** (secret `SUPABASE_DB_URL`). L'ancienne session n'a **jamais**
  appliqué de migration autrement. Le connecteur Supabase (s'il existe) sert à **lire** (`list_migrations`, `select`).

### FRONTEND ≠ BASE (règle centrale)

Le site sur Cloudflare peut être **plus récent** ou **plus ancien** que la base. Les deux se vérifient séparément :

| Quoi | Comment vérifier |
|---|---|
| Version du frontend | commit de `main` (`git log -1 origin/main`) + check « Cloudflare Pages » / « Workers Builds » `success` sur ce commit ; workflow « Adresse du site » |
| Version de la base | « Déploiement de la base » en `simulation` : « Remote database is up to date » = rien en attente ; sinon la liste de ce qui manque. Ou connecteur Supabase `list_migrations` ; ou `select version from supabase_migrations.schema_migrations order by 1 desc limit 5` |
| Cohérence | chaque fichier de `supabase/migrations/` de `main` doit être appliqué, et **aucune** migration appliquée ne doit manquer dans Git |

Piège inverse : si la base contient une migration **absente** du dossier local (cas actuel, §45), `supabase db push`
refuse de continuer (« Remote migration versions not found in local migrations directory »). Il faut alors travailler
depuis la branche qui contient ce fichier (ou l'avoir fusionnée), jamais faire `migration repair` pour l'effacer.

## 16 bis. Migrations : la procédure

1. Nouveau fichier après le dernier : `supabase/migrations/AAAAMMJJNNNNNN_sujet.sql` (numéro du jour, `000001`, `000002`…).
2. Idempotent et non destructif (`if not exists`, `create or replace`, `on conflict do nothing`) ; RLS + politiques sur
   toute table ; `revoke execute … from public, anon` sur les fonctions non publiques ; `notify pgrst, 'reload schema';`
   à la fin si des fonctions changent (évite le cache de schéma de PostgREST).
3. Test métier + `tests/migrations.test.js` (reconstruction depuis zéro) ; `npm test`.
4. Push → CI : la reconstruction sur Supabase neuf doit être verte.
5. Production : Sauvegarde → Déploiement `simulation` (lire la liste : exactement les nouveaux fichiers) → `appliquer` +
   `JE CONFIRME` → vérifier le journal « Applying migration … » → fusion du code → Pilote.
6. Ensuite, ce fichier ne se modifie plus jamais. SOP 03 et 12.

## 17. Incident `importer_catalogue` (« schema cache »)

Message : `Could not find the function public.importer_catalogue(p_etablissement_id, p_lignes, p_simulation) in the schema cache`.

- Contexte : PR #3 (Codex, The Dream) fusionnée le 2026-10-03 18:47. Cloudflare a publié le nouvel écran Articles qui
  appelle la RPC `importer_catalogue`.
- Cause **vérifiée** : la migration `20261003000017_import_catalogue_restaurant` était sur `main` mais **jamais
  déployée** (dernier « Déploiement de la base » : commit `1179483`, migration 16). Frontend plus récent que la base.
- Ce qui n'était pas en cause : signature (identique à l'appel), droits, RLS.
- Diagnostic en 1 minute : « Déploiement de la base » en `simulation` → la migration apparaît en attente. (Ou
  `select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'importer_catalogue'`.)
- Résolution : sauvegarde → déploiement `appliquer` (fait le 2026-10-05 22:20, run 37381307256, avec la migration
  `20261005000001` de la PR #4). Vérifié le 2026-10-08 : la fonction existe en production.
- Si la fonction existe mais le message persiste : cache PostgREST → `notify pgrst, 'reload schema'` dans une migration
  (déjà présent dans `20261005000001`) ; vérifier aussi le nom exact des paramètres envoyés par l'écran et les `grant`.

## 18. Sauvegardes

- Automatique chaque nuit (`sauvegarde.yml`), chiffrée, 30 jours d'artefacts. Vérifié : exécutions réussies les 4, 5,
  6 et 7 octobre.
- Manuelle : Actions → « Sauvegarde de la base » → Run workflow. En manuel, la restauration dans une base vierge et la
  comparaison table par table prouvent que la sauvegarde est **utilisable** (`scripts/verifier_restauration.sh`).
- **Toujours** une sauvegarde manuelle juste avant un `appliquer` et avant toute opération sur des données réelles
  (import de catalogue, correction).
- Restaurer : `docs/PRODUCTION.md` §7 (projet neuf de préférence, jamais par-dessus la production sans accord de Juste).
- Sans `SAUVEGARDE_PHRASE` (gardée aussi hors de GitHub par Juste), une sauvegarde est illisible.

## 19. Pilote en production

Lancer après chaque application de migration et chaque mise en production importante. Il teste avec **uniquement des
données fictives** : création de comptes fictifs, Hubs, articles, ouverture de caisse, ventes (dont crédit), paiements,
annulation, stock et **vente concurrente du dernier article**, clôture (ticket Z), isolation entre deux établissements,
refus (anonyme, autre établissement, droits insuffisants), puis neutralisation (accès retiré, mot de passe détruit,
compte bloqué) et archivage du client « Pilote fictif <date> ». Avec `site`, il vérifie aussi le site publié dans un
vrai navigateur. Dernier pilote vert : run 37119456162 (2026-10-03). **Aucun pilote depuis l'application des migrations
du 2026-10-05.**

## 20. Authentification

- Supabase Auth seul garde les mots de passe. `comptes_connexion` relie un **identifiant** (ex. `patrondream`) à un compte.
- `profils` : nom, photo, fonction, préférences (aucun droit). Rôles plateforme : `plateforme_admins`. Rôles
  d'établissement : `etablissement_membres.role_id` + `permissions_ajustees`.
- Invitation par e-mail, ou **compte sans e-mail** (`creer_membre_sans_email` : identifiant + mot de passe provisoire).
- Mot de passe temporaire : `doit_changer_mot_de_passe` ; tant qu'il n'est pas changé, **la base refuse toute donnée
  métier**. Mots de passe faibles (dont `1234`) refusés comme mot de passe définitif.
- Mot de passe oublié, réinitialisation, session expirée : présents.
- **Éditeur des pages d'authentification** (Super Admin › Identité et apparence › Pages d'authentification,
  `#/editeur/identite/auth`) : textes, logo, apparence de 10 pages et états ; niveaux plateforme → client →
  établissement avec héritage ; brouillon → aperçu → publication ; historique et restauration (`pages_auth`,
  `pages_auth_journal`, `pages_connexion` publique). Ne règle jamais le fonctionnement de l'authentification.
  Doc : `PAGES_AUTHENTIFICATION.md`, SOP 58.

## 21. Sécurité : à ne jamais contourner

- RLS sur toute table `public` ; aucune table lisible par `anon` ; fonctions anonymes = liste fermée testée
  (`tests/audit_offensif.test.js`).
- Écriture uniquement par RPC qui vérifie : membre actif, établissement/client actifs, licence valide, module activé,
  permission, Hub autorisé, objets du même établissement.
- `etablissement_id` et `solution_id` ne changent jamais. Rien ne se supprime (statuts, annulation avec motif).
- `journal_audit` en ajout seul (acteur, avant/après, drapeau `mode_support`).
- Super Admin : lit les données d'un établissement **seulement en session support** journalisée (motif, 8 h, lecture
  seule par défaut). SOP 25.
- Actions sensibles (tarifs, catalogue, administrateurs) : Super Admin seulement. Détail : `SECURITE.md`, SOP 09.

## 22. Modules (catalogue de production, vérifié le 2026-10-08 en lecture)

31 modules, tous au statut `actif` ; 6 solutions actives (`commerce`, `restaurant`, `hotel`, `ecommerce`, `services`,
`rh`) ; 84 permissions.

| Catégorie | Modules (slug) | Doc |
|---|---|---|
| socle | `etablissement`, `membres` | ARCHITECTURE, SECURITE |
| pos | `caisse`, `cloture`, `paiements`, `recus` | COMMERCE |
| ventes | `articles`, `ventes` | COMMERCE |
| stock | `stock` (mouvements, transferts, inventaires par Hub) | COMMERCE, SOP 27–28 |
| finances | `depenses` | COMMERCE |
| crm | `contacts`, `crm_pipeline` | CRM |
| facturation | `facturation`, `abonnements` | FACTURATION, ABONNEMENTS |
| achats | `achats` | ACHATS |
| projets | `projets`, `agenda` | PROJETS, AGENDA |
| rh | `rh_employes`, `rh_presences`, `rh_conges` (pas de paie) | RH |
| restaurant | `restaurant_salle`, `restaurant_cuisine` | RESTAURANT |
| hotel | `hotel_chambres`, `hotel_reservations` | HOTEL |
| ecommerce | `ecommerce_boutique` | ECOMMERCE |
| site_web | `site_web` | SITE_WEB |
| marketing | `fidelite` | FIDELITE |
| support | `support_tickets` | SUPPORT |
| reporting | `tableau_de_bord`, `rapports` | TABLEAUX_DE_BORD |
| documents | `documents` | SOP 43 |

Chaque doc de module liste ses tables, RPC, droits et **limites connues** : la lire avant de dire qu'une fonction existe.
Non programmés volontairement : Marketing SMS/e-mail, Paie, paiement en ligne (aucun prestataire choisi).
Attention : la solution `commerce` ne propose **pas** `restaurant_salle` / `restaurant_cuisine` (seule `restaurant` les
propose), ce qui compte pour The Dream (§25).

## 23. Tableaux de bord

Calculés **par la base** (`cockpit_<domaine>`, `cockpit_etablissement`, `cockpit_domaines`), un par domaine visible
(module actif + permission), indicateurs cliquables vers l'écran filtré, comparaison seulement si la période précédente
a assez de données. Super Admin : `editeur_pilotage` (usage, établissements actifs/endormis, essais). Règle : le tableau
Agence Elite montre une **activité contractuelle** (montants inscrits sur les licences) et affiche les encaissements de
licences « non suivis » ; un chiffre d'établissement « encaissé » vient des **paiements réels**. Ne jamais présenter du
contractuel comme de l'argent encaissé. Doc : `TABLEAUX_DE_BORD.md`, SOP 37.

## 24. Restaurant

Sur `main` (en production côté site) : tables par zone et Hub, commandes (sur table ou à emporter), envoi en cuisine /
bar, écran cuisine, statuts des plats, addition séparée, encaissement par la caisse commune (stock et paiements communs),
annulation avec motif, réservations de tables (capacité, chevauchement), tableau de bord.
Sur la PR #4 (**base déjà en production, écrans pas encore publiés**) : serveurs affectés aux tables avec historique
(`rest_affectations`), transferts de serveur motivés (`rest_transferts_serveur`), statistiques par serveur, filtres de
salle (Mes tables, Libres, Occupées, Réservées, par serveur), page Serveurs, disponibilité / épuisé, catégories
administrables, import v2.
Pas fait : options / suppléments structurés (accompagnements des planches), recettes et déduction des matières, plan de
salle dessiné, impression des bons. Doc : `RESTAURANT.md` (version complète sur la branche de la PR #4), SOP 49.

## 25–26. The Dream Lounge Bar Restaurant (vrai client)

Constaté en production le 2026-10-08 (lecture seule, aucun e-mail ni secret relevé) :

| Élément | Valeur |
|---|---|
| Client | « The Dream Lounge Bar », actif |
| Établissement | « The Dream Lounge Bar Restaurant », actif, devise XAF, mis en service le 2026-10-06 ; **solution `commerce`** |
| Hubs | 1 : « Hub principal » (principal, actif, vente) |
| Modules activés | `articles`, `caisse`, `cloture`, `etablissement`, `membres`, `paiements`, `recus`, `stock`, `tableau_de_bord`, `ventes` — **pas** de Salle ni Cuisine |
| Membres | `patrondream` (gérant, actif, mot de passe déjà changé) ; 2 employés actifs ; 2 employés désactivés |
| Catalogue | **114 articles actifs saisis à la main** du 4 au 7 octobre, 15 catégories, 0 article à référence `DREAM-` (le CSV n'a **pas** été importé), 0 table |
| Activité | 57 ventes, 174 mouvements de stock : **l'établissement travaille déjà en caisse** |

Conséquences à respecter :
- **Ne pas importer `catalogue.csv` sans l'accord de Juste** : l'import v2 dédoublonne par désignation, mais les 114
  articles existants ont été saisis à la main (noms, prix, stock possiblement différents). Faire d'abord un **dry-run**
  depuis le compte `patrondream` et faire relire le rapport à Juste.
- **Salle / Cuisine impossibles en l'état** : l'établissement est en solution `commerce` (qui ne propose pas les
  modules restaurant) et `solution_id` ne change jamais. Options à soumettre à Juste (décision commerciale/technique) :
  ajouter les modules restaurant à la solution Commerce (catalogue, Super Admin, SOP 33) ou autre solution validée.
  Ne rien décider seul.
- **NE PAS** inventer de stock initial, de recettes, de prix. **NE PAS** importer dans `Patrondemo` / « Commerce Démo »
  (établissements fictifs : `Commerce Démo`, `Restaurant Démo`, `Hôtel Démo`, `Boutique en ligne Démo`). Toujours
  vérifier le **nom de l'établissement de destination** affiché par le rapport d'import.
- Catalogue préparé : `donnees/imports/the-dream/` (sur la PR #4 : 228 lignes, 218 vendables, 10 à confirmer, 20
  variantes, 29 catégories, `suivi_stock=non` partout ; README avec divergences et points à confirmer avec le client).
- Procédure : SOP 59 (sur la branche de la PR #4) et `HANDOFF.md` (section « HANDOFF CLAUDE — 2026-10-05 »).
- Autres vrais clients en production : « Hôtel 2i » (établissement « H-2i », solution `hotel`). « Le Kangourou » existe
  comme établissement Commerce sans catalogue.

## 27. Catégories d'articles

Sur `main` : catégories simples (création, rattachement d'un article). Avec la PR #4 (base déjà migrée) : description,
renommage, ordre, masquage (activation / désactivation à l'écran de vente), archivage avec choix de la catégorie qui
reçoit les articles, restauration, déplacement d'un article, déplacement en masse (`enregistrer_categorie_article`,
`ordonner_categories_articles`, `archiver_categorie_article`, `restaurer_categorie_article`,
`deplacer_articles_categorie`) ; écran Articles › Catégories. Les écrans arrivent à la fusion de la PR #4. SOP 41.

## 28. Serveurs et tables

Modèle réalisé (PR #4, base en production) : **TABLE → AFFECTATION (`rest_affectations`, début / fin / auteur / motif)
→ SERVEUR → COMMANDE (serveur repris de l'affectation, `pris_par` = auteur réel) → HISTORIQUE**. Pas de `serveur_id`
permanent sur la table. Une seule affectation en cours par table ; changer de serveur clôt la précédente. Changer le
serveur d'une table ne change pas les commandes ouvertes : `transferer_serveur_commande` (droit
`restaurant_salle.transferer`, motif, historique immuable). Statistiques `statistiques_serveurs_restaurant`. Droits
`restaurant_salle.affecter / transferer / performances`. Écrans : Salle (filtres), `#/salle/serveurs`.

## 29. Codex

- PR #1 (tâches 001–007, socle) : fusionnée le 2026-10-02 après audit et correctifs Claude.
- PR #2 (`codex/realiser-un-audit-technique-complet`) : retours Commerce, réservations Restaurant, séjours Hôtel,
  récompenses Fidélité, audit des configurations, E2E bloquant ; fusionnée le 2026-10-03, migrations renumérotées 10–14.
- PR #3 (`codex/integrer-le-menu-du-the-dream-lounge`, tâche 008) : `importer_catalogue` v1, catalogue v1, gouvernance
  `AGENTS.md` ; fusionnée le 2026-10-03 **sans déploiement de la base** (§17).
- Codex n'a **jamais** eu accès à la production (pas de secret, pas de `gh`, Chromium bloqué). Ses commits n'existent
  sur GitHub que si Juste clique « Créer une PR / Mettre à jour la branche » dans Codex.
- Pilotage de Codex par commentaires `@codex` dans une PR : **en pause** depuis le 2026-10-02 (sauf tâche 008).
- Rien de Codex n'est en attente de fusion au 2026-10-08. Ne pas refaire : import de catalogue, retours, réservations,
  séjours, récompenses.

## 30. SOP

59 SOP dans `docs/SOP/` (58 sur `main`, la 59 sur la PR #4) + modèles `docs/SOP/templates/` + `MISSIONS_SIMULEES.md`.
`docs/SOP/README.md` a une matrice « je veux… → SOP ».

**Règle : avant une modification importante : 1) identifier le domaine ; 2) identifier les SOP concernées dans la
matrice ; 3) les lire ; 4) seulement ensuite modifier.** Toujours aussi : SOP 31 (Definition of Done) et 32.

## 31. Tests

| Quoi | Commande | Où |
|---|---|---|
| Unitaires, intégration, base, RLS, sécurité offensive, isolation, concurrence logique, écrans | `npm test` | local + CI (45 fichiers / 445 tests sur `main`, vérifié ; 465 sur la PR #4 d'après sa description) |
| Build | `npm run build`, `npm run build:demo` | local + CI |
| E2E navigateur (tous les domaines, bureau / tablette / téléphone, erreurs console) | `npm run build:demo && npx vite preview --port 4173 &` puis `CHROMIUM_PATH=… npm run test:e2e` | local (vérifié) + CI (bloquant) |
| E2E Restaurant | `node scripts/parcours_restaurant.cjs` | PR #4 |
| Reconstruction Supabase réelle, pilote API, concurrence de stock réelle, sauvegarde/restauration | job `reconstruction-supabase` | CI seulement (Docker) |
| Production | « Pilote en production » | GitHub Actions |

Ne jamais désactiver ni ignorer un test. Un test « skipped » à cause d'un délai de préparation est un échec (déjà arrivé).

## 32. ERREURS DÉJÀ RENCONTRÉES — NE PAS LES RÉPÉTER

1. **Frontend plus récent que la base** : PR fusionnée, site publié, migration non appliquée → « schema cache » (§17).
2. **Base plus récente que le frontend** : migration appliquée depuis une branche de PR non fusionnée (cas actuel, §45).
   Fusionner rapidement après `appliquer` ; ne jamais créer une nouvelle migration depuis un `main` qui n'a pas le
   fichier appliqué.
3. **Push direct sur `main` avec migration** : le site part avant la base (fenêtre de quelques minutes).
4. **Mauvais établissement** : toujours lire le nom de l'établissement actif / de destination ; `Patrondemo` est gérant
   des établissements fictifs, pas de The Dream.
5. **Workers Builds rouge sur une branche** alors que Pages a réussi : non bloquant (§13).
6. **Chromium absent / CDN Playwright bloqué (403)** : utiliser `CHROMIUM_PATH` vers un Chromium déjà installé ; sinon
   le parcours reste vérifié par la CI.
7. **`gh` non authentifié** : utiliser les outils GitHub du serveur MCP.
8. **Dépôt sans remote / clone superficiel** : `git remote add` ; `git fetch --depth=…` avant push (erreur 413).
9. **Branches divergentes** : `merge`, jamais `force`.
10. **Tests ignorés** : le délai des hooks (`hookTimeout` 60 s) avait fait sauter 19 tests ; corrigé, à surveiller.
11. **E2E qui masquait des erreurs** : le parcours vérifie maintenant chaque domaine et les erreurs console.
12. **Migrations concurrentes** (Claude et Codex le même jour) : numéros en collision ; renuméroter seulement ce qui
    n'a jamais été appliqué ; un seul workflow base à la fois (`concurrency`).
13. **Toucher au CRM séparé** : deux dépôts, deux projets Supabase dans la **même** organisation : vérifier la réf.
    `xrlfedosaqtffraadmgk` avant toute requête.
14. **Codex « a commité » mais rien sur GitHub** : vérifier avec `git fetch` avant d'auditer.
15. **CI annulée sur une PR** (deux CI concurrentes) : relancer, ce n'est pas un échec de code.
16. **Base injoignable depuis GitHub** (pas d'IPv6) : `scripts/url_base.sh` passe au pooler ; ne pas changer le secret.
17. **Ancien Kangourou** : sa base `kangourou-gestion` a été supprimée par Juste le 2026-10-02 ; un autre fil du Projet
    a demandé le 2026-10-06 à Juste comment le recréer (réponse « ancien logiciel »). Si ce travail arrive dans la base
    de la plateforme, il doit rester séparé des tables de la plateforme.

## 33. Secrets (noms seulement)

| Nom | Où | Utilisé par | Pourquoi |
|---|---|---|---|
| `SUPABASE_DB_URL` | GitHub › Settings › Environments › `production` (secrets d'environnement) | `deploiement-base`, `sauvegarde`, `pilote-production`, `demo-comptes`, `verifier-etablissement` | chaîne de connexion Postgres de la production |
| `SAUVEGARDE_PHRASE` | même endroit (+ copie hors GitHub chez Juste) | `sauvegarde` | chiffrement des sauvegardes |
| `GITHUB_TOKEN` / `github.token` | automatique | `adresse-site` | lire checks et déploiements |
| Intégration Cloudflare ↔ GitHub | compte Cloudflare de Juste | Cloudflare | construire et publier |
| Clé publishable Supabase | `.env.production` (publique, **pas un secret**) | build | navigateur |
| SMTP | Supabase › Auth › SMTP (chez Juste) | e-mails Auth | |

La nouvelle session n'a besoin de connaître **aucune valeur**. Jamais de `service_role`. SOP 17.

## 34. MODE AUTONOME (règle pour la nouvelle session)

Quand Juste dit « **Ajoute [fonctionnalité]** », sauf indication contraire, c'est une mission **de bout en bout**.
Ne pas s'arrêter après le code. Workflow normal :

1. comprendre la demande (avant / après pour l'utilisateur) ;
2. inspecter le projet (`git fetch`, PR ouvertes, état base vs `main`) ;
3. lire les SOP du domaine ;
4. vérifier tables, RPC, composants existants (`grep` dans `supabase/migrations/` et `src/modules/`) ;
5. concevoir dans l'architecture (socle unique, module générique, aucune donnée client dans le code) ;
6. frontend ; 7. backend (RPC) ; 8. migration incrémentale ; 9. RLS ; 10. permissions ; 11. audit ;
12. tests (autorisé, refusé, isolation, Hub, concurrence si ressource limitée) ; 13. build ; 14. corriger ;
15. relire le diff ; 16. vérifier qu'aucun secret ni donnée réelle n'est ajouté ;
17. commit ; 18. push (branche `claude/…`) ; 19. PR ; 20. suivre la CI ; 21. la corriger ;
22. lire la préview Cloudflare (§38) ;
23. si migration : **sauvegarde** → **Déploiement de la base `simulation`** depuis la branche → `appliquer` +
    `JE CONFIRME` → lire le journal ;
24. fusionner la PR ; 25. vérifier CI de `main` et checks Cloudflare de `main` ;
26. vérifier la base (`simulation` = rien en attente) ; 27. **Pilote en production** avec `site` ;
28. vérifier bureau / mobile (parcours E2E local ou pilote) et la console ;
29. mettre à jour docs (module, DECISIONS, PROJECT_STATE, SOP, journal `ai/CLAUDE/JOURNAL.md`) ;
30. rendre compte en français simple avec l'état exact et **le lien final**.

Lancer `appliquer` en production est une action à fort impact : la nouvelle session ne le fait que si Juste l'a
autorisé pour cette mission (mandat écrit, ou « vas-y »), après sauvegarde et simulation lues. L'ancienne session
l'a fait sous mandat explicite.

## 35. Quand s'arrêter

Arrêter et demander à Juste seulement pour : accès manquant, secret absent, authentification à faire, permission
inexistante, confirmation humaine imposée, action destructive, doute qui touche des données réelles (The Dream, Hôtel
2i…), production inaccessible, risque de perte de données, décision commerciale (prix, offre, nom).

Toujours distinguer et nommer l'état : **CODE PRÊT → CODE PUSHÉ → CI VERTE → MERGÉ → FRONTEND DÉPLOYÉ → BASE MIGRÉE →
PRODUCTION VÉRIFIÉE.** Ne jamais dire « c'est déployé » sans l'avoir vérifié.

## 36–37. Procédures

Voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) : « Frontend seulement » et « Frontend + base », avec ce qui est automatique et
ce qui est manuel.

## 38. COMMENT OBTENIR LE LIEN FINAL DU DÉPLOIEMENT

Le lien vient du **check « Cloudflare Pages »** que Cloudflare publie sur le commit dans GitHub. Mécanisme exact :

1. Après le push, attendre que le check existe (quelques dizaines de secondes à quelques minutes).
2. Lire les checks : outil GitHub `pull_request_read` (méthode `get_check_runs`) sur la PR, ou workflow « Adresse du
   site » pour le dernier commit d'une branche.
3. Ouvrir le check « Cloudflare Pages » (`get_check_run`) : son résumé contient un tableau
   « Latest commit / Status ✅ Deploy successful! / **Preview URL** / **Branch Preview URL** ».
   - Branche : `Preview URL` = `https://<id>.agence-elite-saas.pages.dev` (ce commit précis) ; `Branch Preview URL`
     = `https://<branche>.agence-elite-saas.pages.dev` (dernier commit de la branche). C'est **le lien .dev à donner
     à Juste** pour tester avant fusion. Attention : une préview appelle la **base de production** (`.env.production`).
   - `main` : déploiement de production → **https://saas.agence-elite.fr** et https://agence-elite-saas.pages.dev ; le
     Worker publie https://agence-elite-platform.justegladerara.workers.dev (check « Workers Builds » = `success`).
   - Le même tableau est aussi posté en **commentaire de la PR** par le bot `cloudflare-workers-and-pages`
     (« Deploying agence-elite-saas with Cloudflare Pages ») : lisible avec `pull_request_read` (`get_comments`). Un
     second commentaire du même bot, « Deploying Preview to Cloudflare … Build: Failed ❌ », concerne le Worker sur
     une branche : non bloquant (§13).
4. Le déploiement est terminé quand le check est `completed` + `success`. Échec = check `failure` (le lien « View logs »
   mène au tableau de bord Cloudflare, accessible à Juste seulement).
5. Vérifier que le site répond : `curl -I <lien>` si le réseau le permet ; sinon « Adresse du site » (affiche le code HTTP
   du workers.dev) ou « Pilote en production » avec `site=<lien>` (vrai navigateur).

Exemple réel (PR #4, commit `478c9f6`) : Preview `https://fce1c7bd.agence-elite-saas.pages.dev`, Branch Preview
`https://claude-inspiring-shannon-wia.agence-elite-saas.pages.dev`.

## 39. Checklist de la nouvelle session (état chez l'ancienne, vérifié le 2026-10-08)

- [x] dépôt accessible (clone via `add_repo` + proxy Git)
- [x] remote `origin` configuré
- [ ] `gh` authentifié (non : token invalide ; remplacé par les outils GitHub MCP)
- [x] outils GitHub au nom de Juste (lecture PR, checks, journaux ; lancement de workflow vérifié avec « Adresse du site »)
- [x] write access (`add_repo` accès `push` accordé ; push de la branche de passation)
- [x] GitHub Actions accessible (liste des exécutions, journaux)
- [x] déploiement Cloudflare observable (checks Pages et Workers sur `main` lus)
- [x] workflows Supabase accessibles (lancement possible ; non relancés le 2026-10-08 car inutiles pour une passation)
- [x] secrets GitHub existants (déduit : sauvegardes nocturnes réussies et déploiement du 2026-10-05 réussi)
- [x] connecteur Supabase en lecture (`list_projects`, `list_migrations`, `select`)
- [x] branche correcte (`main` à jour)
- [x] SOP présentes ; handoff lu
- [x] tests (445/445), build, E2E local avec Chromium préinstallé
- [ ] accès réseau direct au site et à Supabase depuis le conteneur (bloqué par le proxy)
- [ ] accès Cloudflare direct (aucun)

## 43–44. Test de reprise (réponses courtes)

| Question | Réponse |
|---|---|
| Dépôt ? | `justegladerara-cpu/agence-elite-platform` |
| Branche principale ? | `main` |
| Créer une modification ? | branche `claude/<sujet>` depuis `origin/main` (§9) |
| Tester ? | `npm test`, `npm run build`, E2E (§31) |
| Commit / push ? | §9 |
| PR ? | outil GitHub `create_pull_request` vers `main` |
| CI ? | `ci.yml`, 2 jobs, automatique (§11) |
| Cloudflare ? | push → Pages + Worker ; `main` = production (§12) |
| Lien .dev ? | check « Cloudflare Pages » (§38) |
| Supabase ? | §14 ; écriture via Actions seulement |
| Créer une migration ? | §16 bis, SOP 03 |
| Appliquer en production ? | Sauvegarde → Déploiement `simulation` → `appliquer` + `JE CONFIRME` |
| Sauvegarder avant ? | « Sauvegarde de la base » manuel (§18) |
| Pilote ? | « Pilote en production » (§19) |
| Frontend > base ? | simulation qui liste des migrations en attente ; erreur « schema cache » (§15, §17) |
| The Dream ? | §25 ; établissement réel en solution Commerce ; dry-run et accord de Juste |
| Éviter Patrondemo ? | vérifier le nom de l'établissement de destination ; jamais d'import réel dans la démo |
| Hubs ? | §6 ; toute RPC vérifie le Hub ; tests Hub |
| RLS ? | §21 ; RLS + politiques sur toute table ; tests offensifs |
| SOP ? | `docs/SOP/README.md` |
| CI rouge ? | lire le job en échec (`get_job_logs`), reproduire en local, corriger ; `cancelled` = relancer |
| Cloudflare ? | check Pages rouge = bloquant ; Workers rouge sur branche = non bloquant (§13) |
| Supabase ? | simulation du déploiement ; journal ; `list_migrations` ; Supabase › Logs (Juste) |
| Automatique ? | tout le cycle §34 si les accès §39 sont là et le mandat donné |
| Intervention de Juste ? | §35 |

Simulation « Ajoute une réservation avec X » : où coder → `supabase/migrations/` (nouvelle migration) + module
`src/modules/restaurant/` (réservations déjà présentes : `20261003000012_reservations_restaurant.sql`, `Salle.jsx`) ;
tester → nouveau test PGlite + E2E ; migration → §16 bis ; push / CI / déploiement / base / vérification / lien →
§9, §11, §38, `DEPLOIEMENT.md`. Rien ne dépend plus d'une connaissance hors du dépôt, sauf les **accès** (§3 B).

## 45. ÉTAT EXACT DU PROJET (2026-10-08 01:30 UTC)

| Élément | État vérifié |
|---|---|
| `main` | `24b2c66` (fusion PR #3), arbre propre |
| CI de `main` | verte (run 37145505247) |
| Cloudflare sur `main` | « Cloudflare Pages » success (production `agence-elite-saas`) ; « Workers Builds » success ; workers.dev répond 200 depuis GitHub |
| PR ouverte | **#4** « The Dream en service » (`claude/inspiring-shannon-wiaa2q`, `478c9f6`, Claude, autre session) : CI verte sur le push ; une CI de PR `failure` parce que `reconstruction-supabase` a été **annulé** (pas un échec de code) ; Pages success, Workers rouge (non bloquant) ; **pas fusionnée** |
| Base de production | **48 migrations appliquées**, dernière `20261005000001_restaurant_service_categories` (appliquée le 2026-10-05 22:20 depuis la branche de la PR #4, run 37381307256, avec `20261003000017`) |
| Écart | **la base est en avance sur `main`** : `20261005000001` est en production mais absente de `main` ; les écrans Salle / Serveurs / Catégories ne sont pas publiés |
| Sauvegardes | quotidiennes vertes (dernière : 2026-10-07) |
| Pilote | dernier vert le 2026-10-03 ; **pas relancé** depuis les migrations du 2026-10-05 |
| The Dream | actif en caisse (§25), CSV non importé, pas de Salle |
| Travaux non commités | aucun (hors cette passation) |
| Kangourou | décision en cours dans un autre fil du Projet (§32 point 17) |

**Prochaine priorité recommandée** (à faire valider par Juste, car c'est sa PR et cela publie des écrans pour un vrai
client) : 1) relancer la CI de la PR #4 si besoin ; 2) fusionner la PR #4 (la base est déjà prête) ; 3) vérifier les
checks Cloudflare de `main` ; 4) « Déploiement de la base » en `simulation` → doit dire « à jour » ; 5) « Pilote en
production » avec `site=https://saas.agence-elite.fr` ; 6) décider avec Juste de l'import du catalogue et des modules
Salle/Cuisine pour The Dream (§25).

## 45 bis. MISE À JOUR DU 2026-10-08 04:15 UTC (après fusion de la PR #4)

Le §45 ci-dessus est **dépassé** sur ces points (vérifié le 2026-10-08 par la nouvelle session Claude Code) :

| Élément | État vérifié |
|---|---|
| `main` | `c8b40dc` = fusion de la PR #4 (faite par Juste / ChatGPT à 03:55 UTC) ; arbre identique au résultat de fusion testé en local (465/465, builds, parcours Chromium) |
| CI de `main` | verte (run 37725059744 : `tests` et `reconstruction-supabase`) |
| Cloudflare sur `main` | « Cloudflare Pages » success (déploiement `b3890adc`) ; « Workers Builds » success ; workers.dev répond 200 |
| Base | 48 migrations = 48 dans Git ; « Déploiement de la base » `simulation` sur `main` : « Remote database is up to date » (run 37725217791). Aucune migration réappliquée |
| Pilote | vert sur `https://saas.agence-elite.fr` : 76/76 + site 7/7 (run 37726084336). Ne teste pas encore le Restaurant |
| The Dream | « Vérifier un établissement » (run 37725544471, lecture seule) : rien n'a changé ; Salle / Cuisine toujours inactifs (solution `commerce`) ; catalogue non importé |
| PR ouvertes | aucune (hors documentation de cette mise à jour) |

Prochaines actions (décisions de Juste) : modules restaurant pour The Dream (§25), import du catalogue (dry-run puis
accord), et ajout d'un volet Restaurant au « Pilote en production ».

## 45 ter. MISSION « AMÉLIORATIONS MAXIMALES » (2026-10-09) : TERMINÉE

Bilan : `docs/AMELIORATIONS/RAPPORT_FINAL.md`. 12 lots fusionnés (PR #12, #14 à #24) ; migrations
`20261010000101` à `20261010000110` appliquées en production avant chaque fusion ; pilote en production vert sur
`main` `a9a1736` (run 37989650607). Base : 60 migrations en production = 60 dans Git.
Modules ajoutés en Bêta, désactivés par défaut : assistant, production, location, livraisons, scolaire, comptabilite,
marketing. `cockpit_domaines` est redéfini en entier par chaque migration qui ajoute un domaine (21 entrées).
Suite : demande des 150 fonctions, classée dans `docs/AMELIORATIONS/DEMANDE_150_2026-10-09.md`, construite par lots A à H.
Le dépôt est **public** (choix de Juste du 2026-10-09) : ne pas lancer de workflow qui affiche des données de clients
réels (« Vérifier un établissement », « Réconcilier un catalogue »).
Bruit connu : « Workers Builds » échoue sur les branches de PR (le site est publié par Cloudflare Pages) ;
`express-congo.yml` échoue à chaque push (autre session).

## 45 quater. DEMANDE DES 150 : AVANCEMENT (2026-10-10)

Suivi lot par lot dans le tableau « Bilan » de `docs/AMELIORATIONS/DEMANDE_150_2026-10-09.md` (PR, migration, statut).
Lots A à H et P fusionnés et vérifiés en production (migrations `20261010000111` à `20261010000118` ; G sans migration).
Lot P2 (rendez-vous en ligne et aide publiée dans l'espace client, migration `20261010000119`, PR #35) en cours : voir
[`ESPACE_CLIENT.md`](ESPACE_CLIENT.md). Restent : E2, F2, G2, H2. Lignes 66 et 67 bloquées (aucun canal d'envoi).

## 46–47. Prompt pour la nouvelle session

Voir [`../ai/PROMPT_NOUVELLE_SESSION_CLAUDE.md`](../ai/PROMPT_NOUVELLE_SESSION_CLAUDE.md) (à copier-coller tel quel).
