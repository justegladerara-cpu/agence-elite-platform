# Rapport de vérification — 9 octobre 2026

## Soir du 9 octobre 2026

- `npm run check` : **31 tests** (ajouts : lot gardé annulé en entier, hub de paiement — IBAN, droits, plafond des encaissements, clés jamais renvoyées).
- `npx playwright test` : **15 scénarios**, rejouables sur une base remplie (ajout : tarifs, estimation 23,5 kg = 305,50 €, hub, moyens affichés au client).
- `npm audit --omit=dev` : 0 vulnérabilité. `npx prettier --check .` : conforme. `npm run cf:build` réussi ; Worker local : hub 200, transfert 201, PDF 200.
- Parcours automatique de toutes les pages publiques et des vues de gestion (administrateur et client) : aucune erreur console, aucune exception, aucune réponse 4xx/5xx inattendue.

## Reprise du 9 octobre 2026 (Linux, Node.js 22.22, Chromium 153 via PLAYWRIGHT_EXECUTABLE)

- `npm run check` : TypeScript, ESLint et **29 tests** réussis (5 nouveaux : montants exacts, proposition détaillée, inscription/confirmation/réinitialisation, suivi public sans donnée personnelle, confirmation de départ et transfert d’agence).
- `npm run build` et `npm run cf:build` réussis.
- `npx playwright test` : **14 scénarios** réussis, dont le nouveau parcours inscription simulée → expédition → proposition détaillée → suivi public sans session.
- Essai du Worker local (`wrangler dev`, D1 local) : inscription 201, confirmation 200 puis 422 au rejeu, suivi 200 avec le bon code, proposition détaillée 201 (total 2100).

# Rapport précédent — 8 octobre 2026

Environnement exécuté : Windows, Node.js 24.19.0, Chrome installé, APP_ENV=demo. Aucun compte externe. Les commandes ci-dessous se lancent depuis la racine de l’application.

| Commande                                              | Résultat exécuté                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm install                                           | Installation réussie et package-lock.json fourni, versions directes verrouillées                                                                                                      |
| npm run check                                         | TypeScript strict, ESLint et 23 tests métier/intégration réussis                                                                                                                      |
| npm run build                                         | Build optimisé de démonstration réussi, toutes les routes générées/SSR ; aucune publication                                                                                           |
| npm run test:e2e                                      | 12 scénarios réussis, build inclus avant serveur Next start                                                                                                                           |
| APP_ENV=production node scripts/publication-check.mjs | Échec attendu : contenu public non validé. Le build de production invoque ce même garde-fou                                                                                           |
| npm audit --omit=dev --json                           | 0 vulnérabilité signalée pour les dépendances d’exécution                                                                                                                             |
| npm audit                                             | 5 alertes élevées dans les dépendances du linter ; correctif compatible non disponible. Les alertes du npm embarqué ont été éliminées en retirant ce paquet des dépendances du projet |
| npm run db:seed:demo                                  | Données fictives déterministes locales, distinctes des tests                                                                                                                          |

## Couverture réussie

- Volume exact 0,288 m³ ; cm/m ; virgules ; sommes/quantités ; champs vides, négatifs, poids invalide.
- Demande serveur valide, idempotence et conflit de payload, pièces atomiques sans duplication, limitation d’essais persistée.
- Prix manuel si règle absente/non validée ; minimum, frais, paliers décimaux, arrondis entiers et instantané indépendant.
- Sauvegarde/restauration SQLite, intégrité et récupération des devis avec documents BLOB.
- Accès refusé côté repository/API pour client tiers et agent d’une autre agence ; document PDF privé refusé au tiers.
- Réception, écart de mesures bloquant, accord traçable, affectation unique, états reçu/contrôlé/expédié/arrivé/disponible/remis, preuve de retrait obligatoire.
- Correction d’événement conserve l’original ; acceptation propriétaire ne confirme pas de paiement ; versions de propositions indépendantes.
- Toutes les routes et tous les liens/médias internes rencontrés sont contrôlés sans 404. Redirections 301 et contenus retirés 410 testés.
- Formulaire complet dans Chrome, reprise des mesures, enregistrement serveur, aucune fausse annonce d’email.
- Connexion locale d’édition, proposition éditoriale persistée ; portail de démonstration, PDF, étiquette QR et manifeste privé.
- Accueil et calculateur sans débordement à 360, 390, 768, 1 024, 1 440 px. Captures dans docs/screenshots.

## Échecs corrigés pendant la réalisation

Incompatibilité initiale TypeScript 7/linter ; réorganisation des dépendances pnpm pendant un premier build ; titre SVG avec enfants multiples causant un écart d’hydratation ; délai trop court et liens revérifiés plusieurs fois ; noms accessibles des champs modifiés par les erreurs ; lignes SQLite à prototype nul transmises à React ; autorisation d’une mutation examinée après sa transition. Les dernières suites passent après correction.

## Non exécuté / restant

- PostgreSQL, Docker, migrations RLS et restauration PostgreSQL : Docker absent sur l’hôte.
- Supabase, MFA réelle, vérification/récupération d’email, accès Storage privé : non raccordés.
- Email/SMS/WhatsApp automatiques, reprise après échec prestataire, webhooks de paiement et doublons financiers : lot 3 non développé.
- Mesure réelle au 75e percentile LCP/INP/CLS, audit complet WCAG 2.2 AA, téléphone physique et vérification juridique : non réalisés. Les tests de viewport ne prouvent pas une conformité WCAG ni des Core Web Vitals réels.
- Scan documentaire et libération de quarantaine : non connectés, fichiers maintenus privés et indisponibles.
- CI GitHub : configuration préparée ; réussite distante non présumée à partir des tests locaux.

Les refus d’ouverture de production sont volontaires. Le rapport ne transforme pas les modules partiels de HANDOFF.md en modules terminés.

## Reprise Claude — 8 octobre 2026

Environnement : Linux, Node.js 22.22.0, Chrome installé, APP_ENV=demo, aucun compte externe.

| Commande                                              | Résultat exécuté                                               |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| npm ci puis npm run check                             | Types, lint et 23 tests métier réussis                         |
| npm run build                                         | Build de démonstration réussi                                  |
| APP_ENV=production node scripts/publication-check.mjs | Échec attendu (EC-026), garde-fou confirmé                     |
| CI=1 npx playwright test                              | 12 scénarios réussis après correction des URL                  |
| Parcours HTTP de toutes les routes et liens internes  | 26 URL internes en 200, aucune redirection interne, aucune 404 |

Écart corrigé : sans barre finale, /a-propos/, /services/, /contact/, /cgv/ et /mentions-legales/ redirigeaient, et /2025/07/30/comment-prendre-les-mesures/ faisait deux sauts. Le scénario de redirections teste désormais les URL exactes du sitemap WordPress, les deux PDF historiques et l’absence de redirection des pages conservées.

Constat non corrigé : `npx prettier --check .` signale 262 fichiers déjà non formatés avant la reprise. Seuls les fichiers modifiés ont été formatés.

## Refonte et logiciel de gestion — 8 octobre 2026

| Commande                         | Résultat exécuté                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| npm run check                    | Types, lint et 23 tests métier réussis                                                                       |
| CI=1 npx playwright test         | 13 scénarios réussis, dont le nouveau « demandes web : traitement contrôlé côté serveur et tableau de bord » |
| npm run demo:dataset             | 8 expéditions, 5 propositions, 4 demandes web créées via les API, toutes règles métier respectées            |
| npm run capture:local            | Captures régénérées ; LCP laboratoire 912 ms, CLS 0,0007 (accueil mobile, réseau limité)                     |
| Contrôle de débordement à 390 px | Aucune page publique ni écran de gestion plus large que l’écran                                              |

Nouveau scénario : un client reçoit 403 en tentant de changer l’état d’une demande web, une transition interdite (nouveau → acceptée) renvoie 422, l’administrateur passe la demande en étude, puis l’interface affiche le tableau de bord et la fiche avec l’étape suivante proposée.

## Cloudflare Workers + D1 — 8 octobre 2026

| Commande                                                                  | Résultat exécuté                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| npm run check                                                             | Types, lint et 24 tests métier réussis (nouveau : 5 soumissions simultanées → une seule demande)                  |
| CI=1 npx playwright test (Node)                                           | 13 scénarios réussis                                                                                              |
| npx opennextjs-cloudflare build                                           | Build Cloudflare réussi (Next.js 16.3.8)                                                                          |
| wrangler dev --local + BASE_URL=http://127.0.0.1:8787 npx playwright test | 13 scénarios réussis dans workerd avec D1 local                                                                   |
| Requête d’une origine étrangère                                           | 403 confirmé                                                                                                      |
| Contrôle D1 en ligne                                                      | Comptes attendus : 8 expéditions, 7 colis, 3 départs, 28 événements, 5 propositions, 1 assistance, 4 demandes web |

Non exécuté : déploiement réel sur workers.dev (liaison GitHub à faire par le propriétaire du compte) et tests sur l’URL publique.
