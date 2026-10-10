# Passation — état réel au 9 octobre 2026 (soir)

Le projet n’est **pas une plateforme de production terminée**. Le site public et un noyau opérationnel fonctionnent localement en démonstration. Aucun domaine, WordPress, compte prestataire ou hébergement public n’a été modifié. Cette livraison s’arrête à un état testable pour la reprise demandée au §19 ; ne pas confondre démonstration et raccordement de production.

## État par module

| Lot   | Module                                                   | État réel                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Pages publiques et design responsive                     | Terminé en démonstration : toutes les routes, logo source, médias locaux, FAQ, comparatif et fiches agences                                                                                                                                |
| 1     | Contenus et coordonnées                                  | Proposés/observés, non validés ; juridique et horaires restent à confirmer. Production bloquée                                                                                                                                             |
| 1     | Guide de mesures et calculateur                          | Terminé et testé : fractions exactes, cm/m, virgules, quantité, erreurs, reprise des colis dans le devis, impression navigateur                                                                                                            |
| 1     | Demande de devis                                         | Terminée localement : 5 étapes, référence serveur, idempotence atomique, pièces en quarantaine, aucune notification fictive                                                                                                                |
| 1     | Tarification                                             | Module pur testé, inactif ; instantané, unités mineures, minimum, frais, paliers et arrondi. Aucune grille réelle validée                                                                                                                  |
| 1     | Gestion éditoriale                                       | Partielle : édition d’un complément proposé, compteur de version, audit. Pas de workflow d’approbation ni archivage complet de toutes les versions éditoriales                                                                             |
| 1     | Référencement/redirections                               | Préparés et testés ; non-indexation active ; PDF historique vers /tarifs tant qu’une grille n’est pas validée. Inventaire exhaustif WordPress restant                                                                                      |
| 2     | Authentification et portail                              | Partiels : comptes fictifs prédéfinis, scrypt, sessions opaques et déconnexion ; second facteur simulé admin. Inscription, preuve réelle d’email, récupération, MFA de production et organisations multi-utilisateurs restent à développer |
| 2     | Permissions                                              | Lectures et mutations serveur testées par propriétaire et agence ; rôles admin/manager/agent/sales/finance/client dans le domaine. Pas d’interface complète de gestion des habilitations                                                   |
| 2     | Expéditions et colis                                     | Fonctionnels en démo : création, réception, mesures déclarées/contrôlées conservées, réserves, révision requise, accord tracé, étiquette QR sans données personnelles                                                                      |
| 2     | Propositions                                             | Fonctionnelles en démo : versions indépendantes, acceptation par propriétaire, PDF numéroté simple. Modèle commercial détaillé, lignes tarifaires et rattachement aux demandes invité restant à compléter                                  |
| 2     | Départs                                                  | Partiels : lots, affectation unique, contrôle des écarts de mesures, manifeste privé CSV. Confirmation des dates, opérations groupées avec exceptions et transfert d’agence restant                                                        |
| 2     | Suivi                                                    | Historique manuel privé fonctionnel ; transitions, incidents et corrections append-only testés. Suivi public sécurisé/OTP non réalisé et désactivé                                                                                         |
| 2     | Remise                                                   | Parcours testé : arrivé distinct de disponible et remis ; droit de retrait et preuve privée obligatoires. Procédure métier et mandataire non validés                                                                                       |
| 2     | Documents                                                | PDF privés et preuves protégés par propriétaire/agence. Pièces invité en quarantaine, pas d’antivirus, ni Storage Supabase raccordé                                                                                                        |
| 2     | Assistance                                               | Dossiers et réponses persistés avec contrôle du périmètre ; interface conversationnelle à améliorer                                                                                                                                        |
| 2     | Comptes professionnels, import clients, export financier | Non réalisés                                                                                                                                                                                                                               |
| 3     | Notifications, paiements, rendez-vous, import CSV        | Non commencés. Seulement modèle PostgreSQL et variables prévus ; ne pas annoncer des adaptateurs terminés                                                                                                                                  |
| Cible | PostgreSQL/Supabase/Netlify                              | Schéma préparatoire et documentation ; aucune connexion ni migration PostgreSQL exécutée faute de Docker, aucun déploiement                                                                                                                |

## Reprise par Claude (8 octobre 2026)

Vérification indépendante : check, build, garde-fou production et 12 scénarios navigateur rejoués avec succès. Corrigé : barre finale des URL (anciennes adresses WordPress conservées sans redirection, un seul saut pour l’article de mesures) ; horaires publiés et page Facebook ajoutés en OBSERVÉ, masqués en production. Formatage Prettier global non conforme (262 fichiers) déjà présent, non traité.

## Mise en ligne Cloudflare (Claude, 8 octobre 2026)

- Base D1 `express-congo-demo` créée, schéma appliqué, jeu de démonstration chargé (8 expéditions, 7 colis, 3 départs, 28 événements, 5 propositions, 4 demandes web).
- Code compatible Cloudflare Workers (OpenNext) et toujours compatible Node : 24 tests métier, 13 scénarios navigateur réussis sur les deux moteurs.
- **Reste à faire par le propriétaire du compte** : relier le dépôt GitHub au projet Workers `express-congo` (voir README, « Mise en ligne sur Cloudflare »). Cet environnement n’a pas accès réseau à l’API Cloudflare et le connecteur ne déploie pas de code.
- Next.js figé en 16.3.8 (voir DECISIONS). Ne pas mettre à jour sans vérifier le build OpenNext.

## Refonte visuelle et logiciel de gestion (Claude, 8 octobre 2026)

- Site public : nouveau système visuel, accueil avec tracé France → Congo et accès directs (devis, volume, agence), numéros formatés, étapes de devis lisibles.
- Gestion `/demo` : tableau de bord (À faire, propositions par devise, expéditions par étape, activité 14 jours, prochains départs, dernières demandes web), modules Demandes web (traitement des états), Clients, Rapports (volume et poids par agence, chargement par départ, expéditions par étape), Journal d’activité (administrateur). Fiches latérales avec chronologie et actions préremplies ; filtres, tri, export CSV.
- Applications installables : site client et logiciel de gestion (manifestes + icônes).
- `npm run demo:dataset` remplit la démonstration via les vraies API.
- Reste partiel : la gestion utilise toujours les comptes et le stockage de démonstration ; production bloquée jusqu’à EC-025. Pas de paiement, pas de notifications réelles.

## Finalisation et montée en gamme (Claude, 9 octobre 2026)

Nouvelles fonctions, toutes en démonstration (aucun prestataire externe raccordé) :

- **Comptes clients** : inscription (`/demo`, onglet « Mon compte »), confirmation de l’adresse par lien à usage unique (24 h), connexion, mot de passe oublié (lien 1 h, ancien lien révoqué, sessions fermées après changement). Jetons aléatoires stockés hachés (`auth_tokens`). **Aucun email n’est envoyé** : le message est affiché à l’écran dans un encadré « Simulation ». Les comptes publics de démonstration ne sont pas réinitialisables. Les nouveaux clients apparaissent dans la gestion dès confirmation (`people()` remplace la liste figée).
- **Suivi public** `/suivi` : référence + code de suivi à 8 caractères dérivé par HMAC (`TRACKING_SECRET`), rien à stocker. Réponse sans donnée personnelle (ni client, ni commentaire interne, ni preuve), événement corrigé remplacé par sa correction, plafond global et par référence. Code visible et copiable dans la fiche d’expédition, lien de suivi prérempli. Désactivé en production.
- **Propositions détaillées** : lignes libellé / quantité / prix unitaire, total calculé côté serveur en unités mineures entières (`src/domain/proposals.ts`) ; le total saisi est ignoré quand des lignes sont fournies. Fiche et PDF affichent le détail.
- **Départs** : confirmation de la date (`confirmDeparture`) ; affectation groupée depuis la fiche du départ avec compte rendu par expédition (refus expliqués).
- **Transfert d’agence** (`transferShipment`, responsable ou administrateur) : dossier, colis, événements et documents changent d’agence ; refusé si l’expédition est partie et pas encore arrivée, close, ou déjà dans l’agence. Historique des transferts dans la fiche.
- **Contenus** : coordonnées, horaires, à-propos, mentions légales et résumé des CGV (TLF 2017) repris du site officiel expresscongo.fr le 9 octobre 2026. Les crochets « [À CONFIRMER] » sont remplacés par une mention de source discrète ; le contenu reste `PROPOSÉ` et la production reste bloquée (EC-026).
- **Design** : couche `src/app/premium.css` chargée après `globals.css` (profondeur du premier écran, chiffres clés factuels, accès « Suivre mon envoi », cartes et étapes animées, page contact en tuiles, pied de page avec contacts, connexion de la gestion repensée, cartes de suivi, éditeur de lignes). Même identité : bleu nuit, rouge pour les actions, Archivo + Inter.

Vérifié : `npm run check` (29 tests), `npm run build`, `npm run cf:build`, 14 scénarios navigateur, et essai local du Worker (`wrangler dev`, D1) : inscription, confirmation, suivi et proposition.

Reste hors de portée sans prestataire : envoi réel des emails, MFA de production, paiement, notifications, analyse antivirus des pièces, base et authentification de production (EC-022, EC-025, EC-027). Workflow éditorial d’approbation non modifié.

## Grille tarifaire et hub de paiement (Claude, 9 octobre 2026, soir)

- **Grille tarifaire** transmise par le client (identique au PDF du site officiel, SHA-256 `c403eba4…`) : source unique `src/content/tariffs.ts`. Page `/tarifs` avec tableaux par solution, estimation du fret aérien au kilo ou à l’unité, PDF officiel téléchargeable (`public/documents/`). Cartes de services : « Dès 10 € TTC », « 800 € le m³ », « Sur devis ». Les tarifs chiffrés s’ajoutent en un clic dans une proposition. Lecture retenue pour la ligne maritime « 800 » sous l’en-tête « Prix € / Kg » : 800 € pour 1 m³ (à faire confirmer, EC-012). Les anciennes adresses du PDF redirigent toujours vers `/tarifs`.
- **Quantités décimales** dans les propositions (23,5 kg), calcul entier en millièmes, arrondi au centime.
- **Hub de paiement** (gestion → Finance → Hub de paiement ; modification par l’administrateur, consultation par la finance) :
  - moyens hors ligne : compte bancaire (titulaire, IBAN contrôlé par clé ISO 13616, BIC), MTN Mobile Money et Airtel Money (numéro marchand +242), espèces par agence, message libre ; stockés dans la table `settings` ; le journal ne garde que la liste des moyens actifs, jamais les coordonnées ;
  - le client voit ces moyens sur chaque proposition acceptée, avec le numéro comme référence de paiement ; ils figurent aussi sur le PDF ;
  - paiement en ligne : emplacements Stripe (carte), API MTN MoMo et Airtel Money ; les clés ne sont jamais saisies dans l’application mais déposées comme secrets du Worker Cloudflare ; le hub indique seulement « Non connecté / Clés incomplètes / Clés détectées ». La création de paiement et la confirmation par webhook restent à brancher une fois le prestataire choisi (EC-022).
- **Encaissements** (`recordPayment`, administrateur ou finance) : uniquement sur proposition acceptée, moyen activé dans le hub, total plafonné au montant accepté. États « À encaisser / Partiellement réglée / Réglée », barre de progression, liste « Encaissements » (« Mes paiements » pour le client), export CSV.
- **Corrections** : affectation à un départ et transfert d’agence désormais atomiques sur D1 (lot unique avec garde de révision `REQUIRE_CHANGE`) ; wrangler 4.149.0 (0 vulnérabilité, `npm audit --omit=dev`) ; `.prettierignore` pour exclure les fichiers générés (le contrôle Prettier passe) ; tests navigateur rejouables sur une base déjà remplie.

Vérifié : 31 tests métier, 15 scénarios navigateur, build Next et OpenNext, Worker local (hub 200, transfert 201, PDF 200), parcours de toutes les pages et vues de gestion sans erreur console.

## Rattachement à la plateforme Agence Élite (Claude, 9 octobre 2026, soir)

- **Administration par le Super Admin de la plateforme** (dépôt `agence-elite-platform`, menu « Sites clients ») via `/api/plateforme/*` : état, comptes (création par lien d’activation 72 h, rôle, désactivation, lien de mot de passe, fermeture des sessions), démo publique, journal, ouverture de session à usage unique (60 s) sur un compte administrateur personnel `plateforme-<id>`.
- Sécurité : origine contrôlée (CORS), jeton de session vérifié par `est_super_admin()` de la plateforme avec sa clé publishable ; aucun secret partagé. Toutes les actions sont journalisées avec l’acteur `plateforme:<email>`.
- Nouveau : table `account_status` (désactivation), réglage `access` (démo publique), jetons `activate` et `sso`. Un compte désactivé, ou un compte public de démo quand la démo est fermée, est refusé à la connexion **et** perd sa session en cours.
- Corrigé : une empreinte de mot de passe de taille inattendue provoquait une erreur serveur au lieu d’un refus.
- **Pas encore en ligne** : le Worker `express-congo` n’existe pas encore dans le compte Cloudflare (vérifié par le connecteur, seule la base D1 existe). Mise en ligne : README, « Mettre en ligne » (option A ou B).

## Déplacement dans le dépôt de la plateforme (9 octobre 2026)

Le projet vit désormais dans `justegladerara-cpu/agence-elite-platform`, dossier `sites-clients/express-congo` (historique antérieur : dépôt `agenceelite`). Le dépôt de la plateforme est déjà relié à Cloudflare : à l’import du Worker, il apparaît directement. Les tests de la plateforme excluent `sites-clients/**` ; ceux d’Express Congo tournent dans `.github/workflows/express-congo.yml`.

## Publication par GitHub Actions (10 octobre 2026)

Secret `CLOUDFLARE_API_TOKEN` ajouté au dépôt de la plateforme : le job `deploy` de `.github/workflows/express-congo.yml` publie le Worker `express-congo` après chaque vérification verte sur `main`.

## Dernières vérifications

`npm run check` : types, lint et **40 tests métier/intégration locaux réussis**. `npm run test:e2e` : build optimisé de démonstration et **17 scénarios navigateur réussis**, dont réception → départ → remise, accès inter-clients/inter-agences, PDF, QR et manifeste. Voir TEST_REPORT.md pour les commandes, corrections et limites.

## Prochaines étapes ordonnées

1. EC-025 : repositories PostgreSQL/Supabase, Auth éprouvée avec MFA réelle, stockage privé, migrations et politiques RLS ; tester sur base locale Docker. Ne pas ouvrir RLS globalement.
2. Compléter lot 1 : workflow éditorial approuvé et versions archivées, validation du contenu EC-026, document tarifaire versionné après EC-012, inventaire des redirections EC-028.
3. Compléter lot 2 : rattachement invité par preuve, organisations et habilitations, envoi réel des emails d’inscription/récupération (EC-022), libération documentaire après analyse EC-027. Inscription, suivi public limité, propositions détaillées, départs groupés et transferts sont réalisés en démonstration (9 octobre 2026).
4. Rejouer les tests du lot 2 et ajouter les scénarios manquants. Ensuite seulement : lot 3, interfaces/adaptateurs démo, notifications anti-doublons/reprise, webhooks de paiement authentifiés et idempotents, imports et rendez-vous.
5. Préproduction hébergée uniquement après validation du stockage et autorisation applicable. Publication publique hors mission.

## Pièges et dette

- SQLite est un adaptateur de démonstration monoprocessus, impropre aux fonctions éphémères Netlify. La limitation globale des essais est locale et ne remplace pas une protection distribuée par appelant.
- Le second facteur de /demo est public et **simulé** ; il ne valide jamais le MFA de production. /admin est un autre outil local d’édition, pas un accès métier réel.
- Le portail principal reste fermé ; /demo donne accès seulement aux dossiers fictifs. Les identifiants de démo sont documentés et interdits en staging/production.
- Les PDF de propositions sont textuels simples, en ASCII, sans validation du modèle juridique/commercial. Ne pas les envoyer comme offres réelles.
- Les champs de mesures contrôlées sont complets côté API ; l’UI de réception ne propose pour l’instant que le poids contrôlé et reprend les dimensions déclarées.
- Les mots de passe d’exemple, données fictives et mots de passe Docker locaux ne sont pas des secrets de production.
- Audit npm : 0 vulnérabilité dans les dépendances de production (wrangler passé en 4.149.0 le 9 octobre 2026 pour corriger sharp).
- Les captures sont des artefacts documentés, les bases et sauvegardes sont ignorées. Les fichiers .lockfile/.pnpm_modules sont des outils temporaires locaux ignorés, inutiles sur une machine possédant npm standard.

## Démonstration vivante, suivi en direct et WhatsApp (11 octobre 2026)

- **Jeu de démonstration** : `src/server/demo-seed.ts`, version `DATASET_VERSION`. Chargé automatiquement une fois par version (verrou `settings.demo_dataset`), ou par l’administratrice (bouton « Réinitialiser la démo », commande `resetDemo`). Remplace entités, devis et journal métier ; garde comptes, profils, réglages d’accès, de paiement et WhatsApp. 13 personnes fictives (table `profiles`), 26 expéditions à toutes les étapes, propositions au tarif de la grille (montants « démonstration » quand la grille dit « sur devis »), encaissements, assistance, messages WhatsApp simulés. Insertions regroupées (100 paramètres maximum par requête D1).
- **Comptes publics** ajoutés : `agent-pointe-noire@example.invalid`, `finance@example.invalid`. Entrée en un clic sur /demo (cliente, gérante, agent).
- **Dossier en direct** : la cliente A a un envoi marqué `demoLive` qui avance d’une étape toutes les 70 s puis repart (`src/server/live.ts`, calcul au moment des lectures, aucune tâche planifiée).
- **Suivi en direct** : la page /suivi relit toutes les 5 s (`live: true`, plafond large ; chaque échec compte dans le plafond strict anti-essais), carte de trajet animée (position indicative en route, jamais d’heure d’arrivée promise), nouvelles étapes animées, bouton « dossier de démonstration ». Gestion et espace client se rafraîchissent toutes les 10 s hors saisie.
- **WhatsApp** (`src/server/whatsapp.ts`, hub dans la gestion) : mode lien direct (wa.me, numéro réglable) ou WhatsApp Business Platform (API Cloud Meta, version par défaut v23.0). Jeton et clé secrète Meta chiffrés AES-256-GCM avec le secret `WHATSAPP_KEY` du Worker, créé une seule fois par le workflow. Messages automatiques par étape (modèle `suivi_etape` à faire approuver), webhook `/api/whatsapp/webhook/` signé (X-Hub-Signature-256), conversations et réponses. **Connexion réelle refusée tant que la démo publique est ouverte** ou depuis un compte public : sinon tout visiteur lirait les vrais messages. Pour relier le vrai numéro : fermer la démo publique depuis la plateforme, se connecter avec le compte personnel de la gérante.
