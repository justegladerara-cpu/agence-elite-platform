# Express Congo

Projet autonome dans `agence-elite-platform/sites-clients/express-congo` (dépôt de la plateforme Agence Élite ; déplacé depuis le dépôt `agenceelite` le 9 octobre 2026). Référence : `Fiche_Express_Congo_Codex.md` v2 du 8 octobre 2026. Aucun déploiement public ni changement du site WordPress.

## Installation locale

Node.js 24 LTS avec npm. Depuis ce dossier :

```sh
npm install
npm run dev
```

Ouvrir http://127.0.0.1:3000. Le mode par défaut est **Démonstration**, non indexable. La base SQLite est créée dans `.data/demo.db`. Aucun Docker, compte ou secret externe n’est requis pour le site et les tests métier. Les ressources et la police sous licence OFL sont fournies localement ; `assets:fetch` est uniquement un outil de maintenance, jamais nécessaire au build.

Pour personnaliser la configuration, copier `.env.example` vers `.env.local`. Ne fournir que des données fictives en démonstration. Ne pas utiliser ce mode pour recueillir les demandes de vrais clients.

## Vérifications

```sh
npm run check
npm run build
npm run test:e2e
```

Les tests navigateur utilisent Chrome installé, ou `PLAYWRIGHT_CHANNEL=msedge` pour Edge. Sans navigateur installé, Playwright nécessite sa propre installation de Chromium. La suite crée les captures dans `docs/screenshots/` et utilise une base fictive `.data/e2e.db` distincte.

## Gestion locale

`/admin` : accès de démonstration `express-demo-local`, remplaçable par `DEMO_EDITOR_PASSWORD`. Ce mot de passe public n’est pas un secret de production. Les sessions sont opaques, hachées en base, HttpOnly et SameSite strict, expirent après une heure. Cet accès est refusé en staging et en production. Les propositions éditoriales restent `PROPOSÉ` et n’apparaissent qu’en préproduction.

Le portail de démonstration est accessible à `/demo`. Comptes : `client-a@example.invalid`, `client-b@example.invalid`, `agent-paris@example.invalid`, `agent-brazzaville@example.invalid`, `admin@example.invalid` ; mot de passe `DemoExpress!2026`. Le second facteur administrateur affiché est une simulation publique, jamais un MFA réel. Les permissions de lecture et mutation sont néanmoins vérifiées côté serveur sur les dossiers fictifs. Un client peut aussi créer son propre espace (onglet « Mon compte ») : confirmation de l’adresse et mot de passe oublié fonctionnent, le message qui serait envoyé par email s’affiche à l’écran en démonstration. Les comptes professionnels restent à réaliser.

Les devis sont persistés atomiquement avec leurs pièces en quarantaine et une clé d’idempotence. Les pièces ne sont pas téléchargeables, faute d’analyse connectée. Aucun email, paiement ou suivi réel n’est simulé.

## Suivi public

`/suivi` : la référence de l’expédition et son code de suivi (affiché et copiable dans la fiche de l’expédition) donnent les étapes, sans aucune donnée personnelle. Le code est dérivé de `TRACKING_SECRET` (obligatoire hors démonstration).

## Tarifs et paiements

`/tarifs` affiche la grille officielle (source unique `src/content/tariffs.ts`) et une estimation du fret aérien. Dans la gestion, **Finance → Hub de paiement** configure les moyens proposés aux clients (virement, MTN, Airtel, espèces) et montre l’état des connexions de paiement en ligne ; **Encaissements** liste les règlements saisis. Voir INTEGRATIONS.md pour relier Stripe ou une API Mobile Money.

## Logiciel de gestion (démonstration)

`/demo` est conçu comme un logiciel de bureau : barre latérale par domaine (Ventes, Opérations, Support, Analyse), tableau de bord « À faire », demandes web du site, propositions, clients, expéditions, colis, départs, historique, assistance, rapports de chargement et journal d’activité (administrateur). Fiches détaillées avec chronologie, filtres, tri et export CSV des dossiers visibles. Toutes les permissions restent appliquées côté serveur.

Pour remplir la démonstration avec un jeu fictif complet (8 expéditions, 5 propositions, 4 demandes web), serveur lancé :

```bash
npm run db:reset && npm run db:seed:demo   # serveur arrêté
npm run start                               # dans un autre terminal
npm run demo:dataset
```

Le script passe par les mêmes API que l’interface : chaque dossier respecte les transitions, mesures et permissions.

## Applications installables

Le site client (`/manifest.webmanifest`) et le logiciel de gestion (`/gestion.webmanifest`, ouverture sur `/demo/`) s’installent depuis Chrome ou Edge (« Installer l’application ») sur PC, et depuis le navigateur du téléphone. Aucun service worker : aucune page ni document privé n’est mis en cache hors ligne. En production, le manifeste de gestion devra pointer vers l’administration réelle une fois l’authentification raccordée (EC-025).

## Mise en ligne sur Cloudflare (préproduction de démonstration)

Le site tourne sur Cloudflare Workers via l’adaptateur OpenNext, avec la base **D1** `express-congo-demo` (même SQL que la base locale). Configuration : `wrangler.jsonc` (Worker `express-congo`, liaison `DB`, `APP_ENV=demo`, `DATABASE_DRIVER=d1`) et `open-next.config.ts`.

**Mettre en ligne (une seule fois, au choix)** — l’adresse sera `https://express-congo.justegladerara.workers.dev`, celle qu’attend la plateforme Agence Élite.

_Option A — relier le dépôt dans Cloudflare (recommandé, aucun jeton)_ : tableau de bord Cloudflare → Workers & Pages → Créer → Importer un dépôt Git :

| Réglage                 | Valeur                                                     |
| ----------------------- | ---------------------------------------------------------- |
| Dépôt                   | `justegladerara-cpu/agence-elite-platform`, branche `main` |
| Nom du projet           | `express-congo` (doit correspondre à `wrangler.jsonc`)     |
| Répertoire racine       | `sites-clients/express-congo`                              |
| Commande de build       | `npx opennextjs-cloudflare build`                          |
| Commande de déploiement | `npx opennextjs-cloudflare deploy`                         |

_Option B — publication par GitHub Actions_ : créer un jeton Cloudflare (modèle « Modifier les Workers Cloudflare ») et l’ajouter dans GitHub → Settings → Secrets → Actions, environnement `production`, sous le nom `CLOUDFLARE_API_TOKEN` (et `CLOUDFLARE_ACCOUNT_ID` si le compte en a plusieurs). Le job `deploy` de `.github/workflows/express-congo.yml` publie alors après chaque vérification verte sur `main`.

Ensuite chaque push sur `main` redéploie le site. Aucun autre secret : D1 est relié par son identifiant, et la vérification Super Admin utilise l’URL et la clé publique de la plateforme (`wrangler.jsonc`).

## Administration depuis la plateforme Agence Élite

Le Super Admin de la plateforme gère le site depuis **Sites clients → Express Congo** : comptes et rôles (création par lien d’activation de 72 h, changement de rôle, désactivation immédiate, lien de nouveau mot de passe, fermeture des sessions), démo publique ouverte ou fermée, journal, et « Ouvrir la gestion » (connexion administrateur par lien de 60 s). API : `/api/plateforme/{etat,comptes,journal,acces,session}/` (`src/server/platform.ts`). Le jeton de session reçu est vérifié par la fonction `est_super_admin()` de la plateforme ; seules les origines de la plateforme sont acceptées (CORS). **Pensez à fermer la démo publique** dès que de vrais utilisateurs travaillent sur le site.

Tester localement dans le moteur Cloudflare (workerd + D1 local) :

```bash
npm run cf:build
npx wrangler dev --local --var COOKIE_SECURE:false   # http://127.0.0.1:8787
BASE_URL=http://127.0.0.1:8787 npx playwright test
```

`COOKIE_SECURE=false` sert uniquement aux aperçus en HTTP ; en ligne (HTTPS) les cookies restent `Secure`.

## Base PostgreSQL préparée

Docker Compose est un outil de préparation distinct de l’adaptateur SQLite utilisé par l’application locale.

```sh
npm run db:start
npm run db:migrate
npm run db:seed:demo
```

`db:migrate` prépare le schéma PostgreSQL interne `ec`, avec RLS fermé. L’application n’y est pas encore raccordée. `db:seed:demo` alimente uniquement la base locale SQLite. `db:reset` réinitialise SQLite : arrêter le serveur avant de l’exécuter, puis le relancer. Aucune donnée réelle ne figure dans le jeu d’essai.

## Sauvegarde locale

Arrêter le serveur avant restauration.

```sh
npm run db:backup
npm run db:restore -- .backups/demo.sqlite
```

La sauvegarde SQLite contient aussi les pièces jointes privées en BLOB. Si le fichier de sauvegarde existe déjà, l’archiver avant une nouvelle sauvegarde. La restauration contrôle l’intégrité ; elle ne remplace pas une procédure de sauvegarde de production.

## Préproduction et publication

L’aperçu fourni est local. Le stockage SQLite est impropre aux fonctions éphémères Netlify. Raccorder l’adaptateur de données, Auth avec MFA et Storage privé avant tout aperçu Netlify persistant. Ne pas simplement activer `APP_ENV=production` : le garde-fou de publication échoue volontairement tant que EC-025/026 ne sont pas traités. Les coordonnées observées ne deviennent jamais validées par un changement de variable.

Lire `HANDOFF.md` pour l’état réel, `TEST_REPORT.md` pour les vérifications et `LAUNCH_REGISTER.md` pour les validations. La présence d’une route ou d’un schéma ne signifie pas que le module opérationnel est terminé.
