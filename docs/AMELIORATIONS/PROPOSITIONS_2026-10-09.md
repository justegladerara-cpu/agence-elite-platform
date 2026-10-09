# Catalogue des propositions — 2026-10-09

Phase 2 de la mission « Améliorations maximales ». Source : [INVENTAIRE_2026-10-09](INVENTAIRE_2026-10-09.md).
**Ce fichier est le plan de travail** : la colonne « Statut » est mise à jour à chaque étape avec les mots exacts
CODE PRÊT · CODE PUSHÉ · CI VERTE · MERGÉ · FRONTEND DÉPLOYÉ · BASE MIGRÉE · PRODUCTION VÉRIFIÉE, ou « Prévu » /
« Bloqué : raison ».

Légende — Effort : S (< ½ jour), M (1 jour), L (2-3 jours), XL (> 3 jours). Gain : 1 (faible) à 5 (fort).
Risque : F (faible), M (moyen), É (élevé : données réelles ou argent). Statut cible = statut honnête visé à la fin de
la mission (Disponible / Bêta / En développement / Prévu).

Règles communes : écriture par RPC `security definer` + `exiger_permission`, lecture par RLS, isolation
Client → Établissement → Hub, manifeste + menu + `cockpit_<domaine>` + réglages, données de démo fictives, doc
`docs/<MODULE>.md` avec « Limites connues », SOP d'usage. Rien de figé pour un pays, une langue, une devise ou un
fournisseur.

---

## A. Confort transversal

| ID | Titre | Problème → changement | Profils | Modules | Tables / RPC / écrans | Dép. | Eff. | Gain | Risque | Cible | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T01 | Recherche universelle Ctrl+K | il faut connaître le menu → palette écrans + créations + données | tous | socle + 13 domaines | RPC `recherche_universelle` (invoker), `Palette.jsx` | — | M | 5 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T02 | Création rapide « + » | créer = trouver l'écran → 15 créations en un geste | tous | 12 modules | `actionsRapides.js` | T01 | S | 4 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T03 | Raccourcis clavier | aucun → Ctrl+K, /, N, ?, Échap | bureau | socle | `useRaccourcis` | T01 | S | 3 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T04 | Thème sombre, texte, contraste, gros boutons | aucun réglage → préférences par appareil | tous | socle | `affichage.js`, Mon profil › Préférences | — | M | 4 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T05 | Export CSV + impression de toute liste | export selon l'écran → générique dans `DataTable` | gérant, comptable | tous | `DataTable` | — | M | 5 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T06 | Export des ventes | aucun export → CSV des ventes filtrées | gérant, comptable | ventes | `Ventes.jsx` | T05 | S | 4 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T07 | Application installable | pas de manifeste → icône sur l'écran d'accueil | tous | socle | `manifest.webmanifest` | — | S | 3 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T08 | Chargement à la demande | 897 ko d'un bloc → 433 ko + écrans à la demande | tous | tous | manifestes `React.lazy` | — | S | 4 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #12) |
| T09 | Export des listes simples | articles, contacts, dépenses, clôtures sans export → bouton CSV | gérant, comptable | 4 modules | écrans concernés | T05 | S | 4 | F | Disponible | MERGÉ · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #14) |
| T10 | Cibles tactiles RH / Projets / éditeur | 8 à 16 boutons < 32 px sur téléphone → tailles et menus « … » | RH, chef de projet | rh, projets, éditeur | CSS + écrans | — | S | 3 | F | Disponible | MERGÉ · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #14) |
| T11 | Accueil personnalisable | même accueil pour tous → tuiles choisies par la personne | tous | tableau de bord | préférences du membre | — | M | 3 | F | Bêta | Prévu |
| T12 | Brouillons automatiques | saisie perdue si on ferme → brouillon local des formulaires longs | tous | facturation, achats | stockage local | — | M | 3 | F | Bêta | Prévu |
| T13 | Vues enregistrées des listes | filtres à refaire → vues nommées par personne | gérant | tous | préférences | T05 | M | 3 | F | Bêta | Prévu |
| T14 | Fil d'activité | journal d'audit invisible → fil lisible par établissement | gérant | socle | `evenements` (lecture) | — | M | 3 | F | Bêta | Prévu |
| T15 | Mode hors ligne (caisse) | coupure = caisse arrêtée → file d'attente locale et rejeu idempotent | caissier | caisse | service worker, RPC idempotente | T07 | XL | 5 | É | Prévu | Prévu |
| T16 | Double authentification / PIN de caisse | mot de passe seul → TOTP pour gérants, PIN rapide en caisse | gérant, caissier | socle, caisse | Supabase Auth MFA | — | L | 4 | M | Prévu | Prévu |
| T17 | Modèles de documents + QR | documents figés → modèles par établissement, QR de vérification | gérant | facturation, documents | `documents_modeles` | — | L | 3 | F | Prévu | Prévu |
| T18 | Imports guidés (contacts, stock initial) | saisie à la main → import CSV avec dry-run | gérant | contacts, stock | RPC d'import | — | M | 4 | M | Bêta | Prévu |
| T19 | Performance stock / tableau de bord | 10-25 s en démo locale → index et agrégats | tous | stock, cockpit | migrations d'index | — | M | 4 | M | Disponible | Prévu |
| T20 | Parcours éditeur à jour en CI | `parcours_editeur.cjs` périmé → réparé et lancé en CI | — | éditeur | script + `ci.yml` | — | S | 3 | F | Disponible | MERGÉ · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #14) |

## B. Améliorations des modules existants

| ID | Titre | Problème → changement | Profils | Modules | Tables / RPC / écrans | Dép. | Eff. | Gain | Risque | Cible | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Ventes en attente | un client hésite = ticket bloqué → mettre en attente, reprendre | caissier | caisse | `ventes.statut='en_attente'`, RPC | — | M | 5 | M | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #15) |
| C02 | Ticket X | seulement le Z → état intermédiaire sans clôture | caissier, gérant | clôtures | RPC lecture | — | S | 4 | F | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #15) |
| C03 | Comptage par coupure | total saisi à la main → billets et pièces (devise de l'établissement) | caissier | clôtures | réglage des coupures | — | M | 4 | M | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #15) |
| C04 | Plafond de remise par rôle | remise libre → plafond réglable, au-delà validation | gérant | caisse | réglage + contrôle RPC | — | M | 4 | M | Disponible | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #15) |
| F01 | Balance âgée clients | retards invisibles → 0-30 / 31-60 / 61-90 / +90 jours | comptable | facturation | RPC lecture | — | S | 5 | F | Disponible | MERGÉ · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #16) |
| F02 | Relances graduées | relance manuelle → niveaux et modèles de message | comptable | facturation | `relances` | I04/I05 | M | 4 | M | Bêta | MERGÉ · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #16) |
| F03 | Acceptation de devis par lien | devis par PDF → lien public signé, acceptation tracée | commercial | facturation | jeton signé | — | L | 4 | M | Bêta | Prévu |
| F04 | Acomptes et avoirs partiels | `FACTURATION.md:29` → acomptes déduits, avoir sur lignes | comptable | facturation | RPC | — | L | 4 | É | Prévu | Prévu |
| R01 | Fiches techniques (recettes) | ingrédients non déduits → recette par plat | gérant restaurant | restaurant, stock | `recettes` | P01 | L | 4 | M | Bêta | Prévu |
| R02 | Options payantes par plat | note libre → suppléments tarifés | serveur | restaurant | `article_options` | — | L | 4 | M | Prévu | Prévu |
| H01 | Acompte de réservation | `HOTEL.md:51` → acompte encaissé, déduit au départ | réception | hôtel | RPC | — | M | 4 | É | Prévu | Prévu |
| H02 | Report restaurant sur la chambre | `HOTEL.md:53` → note reportée sur le séjour | serveur, réception | hôtel, restaurant | RPC | — | M | 4 | É | Prévu | Prévu |
| L01 | Remise fidélité en caisse | `FIDELITE.md:34` → récompense appliquée au ticket | caissier | fidélité, caisse | RPC | — | M | 3 | M | Prévu | Prévu |

## C. Les 10 nouveaux modules

| ID | Module | Contenu minimal pour « Bêta » | Profils | Tables / RPC / écrans | Dép. | Eff. | Gain | Risque | Cible | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Comptabilité | plan de comptes réglable (aucun plan national imposé), journaux, écritures générées depuis ventes / dépenses / achats / factures, balance, grand livre, export | comptable | `compta_*`, `cockpit_comptabilite` | — | XL | 5 | É | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #23) |
| M02 | Paie | **bloqué** : aucune règle de paie fournie (cotisations, barèmes) | RH | — | règles de Juste | XL | 4 | É | Prévu | Bloqué : règles de paie non fournies |
| M03 | Marketing | segments de contacts, campagnes (brouillon → envoi par intégration), suivi | commercial | `mkt_*` | I04/I05/I03 | L | 4 | M | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #24) |
| M04 | Production | nomenclatures, ordres de fabrication, consommation et entrée en stock | gérant, atelier | `prod_*`, `cockpit_production` | — | L | 4 | M | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #19) |
| M05 | Livraisons | tournées, livreurs, statut, preuve de livraison, lien commandes boutique / ventes | livreur, gérant | `liv_*` | — | L | 4 | M | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #21) |
| M06 | Ventes terrain | commandes hors boutique sur téléphone, tournées commerciales ; dépend du hors ligne | commercial terrain | `vt_*` | T15 | XL | 4 | É | Prévu | Prévu (attend le mode hors ligne T15) |
| M07 | Location | parc d'objets loués, contrats, caution, retours, disponibilité | gérant | `loc_*`, `cockpit_location` | — | L | 4 | M | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #20) |
| M08 | Immobilier | biens, lots, baux, loyers, quittances | gestionnaire | PR #11 (autre session, migration `20261010000001`) | — | — | 4 | M | Bêta | Bloqué : PR #11 Immobilier non terminée (tables en production, écrans absents) |
| M09 | Scolaire | élèves, classes, inscriptions, frais de scolarité, paiements | secrétariat | `sco_*`, `cockpit_scolaire` | — | L | 4 | M | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #22) |
| M10 | Assistant intelligent | anomalies calculées par la base (ventes annulées, écarts de caisse, ruptures, impayés) ; pas d'IA générative sans fournisseur | gérant | RPC `assistant_alertes` | — | M | 4 | F | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #18) |

## D. Les 10 intégrations (toujours par un adaptateur commun)

Socle commun **I00** (à faire en premier) : table des connexions par établissement, secrets **chiffrés** (AES-GCM,
clé dans l'environnement Cloudflare, jamais relus en clair par l'interface), journal des appels, mode test, webhooks
signés (HMAC) et idempotents, écran « Connexions » simple, désactivation en un clic. Une intégration n'est
« Disponible » qu'après test contre le **vrai bac à sable** du fournisseur.

| ID | Intégration | Usage | Dép. | Eff. | Gain | Risque | Cible | Statut |
|---|---|---|---|---|---|---|---|---|
| I00 | Socle des intégrations | connexions, secrets chiffrés, journal, webhooks | — | L | 5 | É | Bêta | MERGÉ · BASE MIGRÉE · FRONTEND DÉPLOYÉ · PRODUCTION VÉRIFIÉE (PR #17) |
| I01 | Mobile Money | encaissement caisse / boutique / factures | I00 | L | 5 | É | En développement | Prévu (Bloqué : opérateur et accès bac à sable à choisir) |
| I02 | Carte (Stripe) | paiement en ligne boutique / factures | I00 | M | 4 | É | En développement | Prévu (Bloqué : compte Stripe de test) |
| I03 | WhatsApp Business | reçus, relances, confirmations | I00 | M | 5 | M | En développement | Prévu (Bloqué : compte WhatsApp Business) |
| I04 | E-mail transactionnel | factures, invitations, relances | I00 | M | 5 | M | En développement | Prévu (Bloqué : fournisseur à choisir) |
| I05 | SMS | rappels agenda, codes, relances | I00 | M | 4 | M | En développement | Prévu (Bloqué : fournisseur à choisir) |
| I06 | Google / Microsoft | agenda et contacts | I00 | L | 3 | M | En développement | Prévu (Bloqué : application OAuth) |
| I07 | Logiciel comptable | export / envoi des écritures | M01, I00 | M | 4 | M | En développement | Prévu (Bloqué : logiciel comptable cible à choisir) |
| I08 | Channel manager | disponibilités et réservations hôtel | I00 | L | 4 | É | En développement | Prévu (Bloqué : fournisseur à choisir) |
| I09 | Livraison de repas / réseaux sociaux | commandes entrantes restaurant / boutique | I00 | L | 3 | M | En développement | Prévu (Bloqué : fournisseur à choisir) |
| I10 | Matériel de caisse + webhooks signés | imprimante ticket, tiroir, lecteur, webhooks sortants | I00 | L | 4 | M | Bêta (webhooks) | Prévu (Bloqué : matériel à valider) |

---

## TOP 20 (gain fort, risque maîtrisé, en premier)
T01 · T05 · T02 · T08 · T04 · T09 · F01 · C01 · C02 · I00 · T19 · C04 · C03 · M10 · M04 · M07 · M05 · M09 · M01 · T18

## Ordre de construction
1. **Lot 1** confort : T01-T08 (PR #12).
2. **Lot 2** listes et téléphone : T09, T10, T20.
3. **Lot 3** caisse : C01, C02, C03, C04.
4. **Lot 4** facturation : F01, puis F02 et F03 (envoi réel après I04 / I03).
5. **Lot 5** socle des intégrations I00, puis les adaptateurs I01-I10 en **mode test** (simulateur interne), chacun
   « Bloqué » sur son bac à sable tant qu'aucune clé de test n'est fournie.
6. **Lot 6** modules : M10 Assistant → M04 Production → M07 Location → M05 Livraisons → M09 Scolaire → M01 Comptabilité
   → M03 Marketing. M08 Immobilier suit la PR #11. M06 Ventes terrain attend T15. M02 Paie attend les règles.

## Décisions pour Juste (une ligne chacune, recommandation en gras)
1. Dépôt GitHub : **repasser en privé** dès que le quota Actions le permet (sinon les données The Dream restent lisibles).
2. Fichiers The Dream dans le dépôt (`donnees/imports/the-dream/`) : **les retirer de la branche principale** (l'historique les garde tant que le dépôt est public).
3. Mobile Money : **choisir un agrégateur** (un seul contrat, plusieurs opérateurs) et donner un accès bac à sable.
4. E-mail : **choisir un fournisseur transactionnel** et donner une clé de test.
5. SMS / WhatsApp : **commencer par WhatsApp Business** (usage dominant chez vos clients), SMS ensuite.
6. Paie : **fournir les règles du premier pays** (cotisations, barèmes), sinon le module reste « Prévu ».
7. Comptabilité : **plan de comptes réglable** avec un modèle par défaut à valider par un comptable.
8. PR #11 Immobilier : **la faire terminer par sa session** avant d'ajouter d'autres modules métiers.
