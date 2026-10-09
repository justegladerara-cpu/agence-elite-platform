# État du projet (mis à jour le 2026-10-09)

## Mission en cours : « Améliorations maximales » (2026-10-09)
Plan et statuts dans `docs/AMELIORATIONS/`. Lot 1 « Confort transversal » ([CONFORT](CONFORT.md)) : recherche Ctrl+K,
création rapide, thème sombre, export des listes, application installable. Statut : CODE PRÊT (migration
`20261010000101` non appliquée).

## Mission terminée : « The Dream en service » (PR #4) — vérifiée en production le 2026-10-08

| Élément | Git | Production (vérifié le 2026-10-08) |
|---|---|---|
| PR #4 | fusionnée sur `main` (`c8b40dc`, 2026-10-08 03:55 UTC) | CI `main` verte : `tests` + `reconstruction-supabase` (run 37725059744) |
| Migrations `20261003000017` et `20261005000001` | `main` | **appliquées** le 2026-10-05 (run 37381307256, depuis le commit `478c9f6` = tête de la PR) ; simulation du 2026-10-08 sur `main` : « Remote database is up to date » (run 37725217791) |
| Écrans Salle / Serveurs / Articles › Catégories | `main` | **publiés** : « Cloudflare Pages » et « Workers Builds » `success` sur `c8b40dc` (run « Adresse du site » 37726081940) |
| Pilote en production (`site=https://saas.agence-elite.fr`) | — | **76/76** + site **7/7** (run 37726084336) — parcours Commerce, isolation, sécurité ; il ne couvre **pas** encore le Restaurant (couvert par la CI : tests PGlite + parcours Chromium Restaurant ordinateur / tablette / téléphone) |
| The Dream (lecture seule, run 37725544471) | — | inchangé : solution `commerce`, 1 Hub, 10 modules **sans** Salle ni Cuisine, 114 articles, 15 catégories, 0 table, 0 article `DREAM-` ; `patrondream` gérant actif avec tous les droits restaurant (inutilisables tant que les modules ne sont pas activés) |
| Catalogue The Dream (218 articles, 29 catégories, 10 à confirmer) | `donnees/imports/the-dream/` | **NON importé** (attend l'accord de Juste, dry-run d'abord, SOP 59) |

Décision attendue de Juste : comment donner Salle / Cuisine à The Dream (établissement en solution `commerce`,
`solution_id` immuable), et import du catalogue (fusion avec les 114 articles saisis à la main).

## Mission précédente

La tâche active est `ai/TACHES/008-onboarding-the-dream.md` : préparation et onboarding contrôlé de « The Dream Lounge Bar Restaurant ». La tâche 001 reste l'archive des fondations du Lot 1 et ne décrit plus le périmètre courant. L'état de production de l'import The Dream doit rester indiqué comme non appliqué tant que le workflow protégé et les smoke tests n'ont pas réellement abouti.

Préparation actuelle : migration d'import avec dry-run, écran Articles et catalogue de 221 lignes vendables prêts localement. La production The Dream et le contexte `patrondream` ne sont pas encore vérifiés, faute de session ou de secret disponible dans l'environnement de développement.

## En production
| Élément | État |
|---|---|
| Site | https://saas.agence-elite.fr (Cloudflare Pages `agence-elite-saas`) et https://agence-elite-platform.justegladerara.workers.dev (Worker), publiés à chaque push sur `main` ; `main` = `c8b40dc` |
| Base | Supabase `xrlfedosaqtffraadmgk` (eu-west-3) : **48 migrations appliquées** (dernière `20261005000001_restaurant_service_categories`) = 48 dans Git, rien en attente (vérifié le 2026-10-08) |
| Socle | comptes (Supabase Auth, identifiant ou e-mail), clients, établissements, Hubs, licences, rôles et permissions, notifications, pièces jointes, journal d'audit |
| Espace Agence Elite | tableau de bord, clients, établissements, Hubs, catalogue (modules, solutions, catégories, identité), comptes, offres et prix |
| Personnalisation | identité plateforme → client → établissement (palette contrôlée), écran de connexion `#/connexion/<adresse>` (client ou établissement) |
| Pages d'authentification | Espace Agence Elite › Identité et apparence : textes, identité, apparence de 10 pages et états, brouillon / aperçu / publication / historique ([PAGES_AUTHENTIFICATION](PAGES_AUTHENTIFICATION.md), [SOP 58](SOP/58_PERSONNALISER_LES_PAGES_DE_CONNEXION.md)) ; mot de passe oublié et session expirée |
| Paramètres | onglets Entreprise, Apparence, Documents, Caisses, **Réglages des modules** (formulaire généré depuis `parametres_schema`), Applications, Équipe, Sécurité, Licence |
| Catalogue | 31 modules Disponibles, 6 solutions (Commerce, Restaurant, Hôtel, E-commerce, Services, RH) |
| Sauvegarde | chiffrée chaque nuit + vérification de restauration ; lancée aussi avant chaque migration |
| Clients réels | The Dream Lounge Bar (solution `commerce`, caisse active), Hôtel 2i (`H-2i`, solution `hotel`) ; démo fictive « Commerce Démo » (Commerce Démo, Restaurant Démo, Hôtel Démo, Boutique en ligne Démo) |

## Modules disponibles
| Domaine | Modules (doc) |
|---|---|
| Commerce | caisse, ventes, paiements, reçus, clôtures, dépenses, articles, stock, contacts ([COMMERCE](COMMERCE.md)) |
| Gestion | Facturation ([FACTURATION](FACTURATION.md)), Achats ([ACHATS](ACHATS.md)), Abonnements ([ABONNEMENTS](ABONNEMENTS.md)), Rapports ([RAPPORTS](RAPPORTS.md)) |
| Relations | CRM ([CRM](CRM.md)), Agenda ([AGENDA](AGENDA.md)), Support ([SUPPORT](SUPPORT.md)), Fidélité ([FIDELITE](FIDELITE.md)), Site web ([SITE_WEB](SITE_WEB.md)) |
| Organisation | RH : employés, présences, congés ([RH](RH.md)) ; Projets ([PROJETS](PROJETS.md)) ; Documents |
| Métiers | Restaurant : salle, cuisine ([RESTAURANT](RESTAURANT.md)) ; Hôtel : réservations, chambres ([HOTEL](HOTEL.md)) ; E-commerce ([ECOMMERCE](ECOMMERCE.md)) |

Pages publiques sans connexion : `#/commander/<adresse>` (boutique), `#/suivi/<id>` (suivi de commande), `#/site/<adresse>[/<page>]` (site web).

## Numérotation des migrations
Nom = date + numéro **du jour** (`AAAAMMJJ` + `0000NN`). 1er octobre : 8 ; 2 octobre : 22 ; 3 octobre : 14. La liste
appliquée se vérifie avec le workflow « Déploiement de la base » en mode simulation (« aucune migration en attente »).

## Comptes Agence Elite
`contact@agence-elite.fr` (identifiant `Justegladerara`, Super Admin) ; `Admin` (mot de passe temporaire).
Comptes démo : voir [SOP 30](SOP/30_DEMO_COMMERCIALE.md) (`gerante@`, `resto@`, `reception@`, `boutique@demo.agence-elite.fr`…).

## Qualité
- 400+ tests (PGlite) dont tests offensifs (droits, isolation entre établissements, appels anonymes) ; tests d'écrans ; parcours navigateur bloquant de tous les domaines en CI.
- CI : base Supabase neuve, démo rejouée 2 fois, pilote API, parcours mot de passe sur Auth réel ; pilote en production
  (`pilote-production.yml`) après chaque mise en production.

## Pas encore fait (voir le rapport final)
- Nom commercial de la plateforme (à décider par Juste) ; domaine personnalisé.
- Marketing (SMS, e-mails de campagne) : aucun fournisseur choisi, consentement à définir.
- Paie : règles (barèmes, cotisations) non définies ; seule la préparation RH existe.
- Paiement en ligne (boutique, abonnements) : aucun prestataire choisi.
