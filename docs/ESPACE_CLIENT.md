# Espace client

Module `portail_client` (statut « Bêta », lot P, 2026-10-10, migrations `20261010000118` et `20261010000119` pour le lot P2). Dépend du module Contacts.
Accordé dans toutes les offres mais non activé par défaut. SOP : [71](SOP/71_OUVRIR_UN_ESPACE_CLIENT.md).

## Principe
L'équipe ouvre l'espace d'un **contact** : la plateforme crée un lien secret `#/espace/<jeton>` (64 caractères), montré
**une seule fois** (copier, ou envoyer par WhatsApp). Seule l'empreinte SHA-256 du jeton est gardée en base : personne ne
peut relire le lien ensuite. Le lien expire (30 jours par défaut, réglage `duree_jours`) et se révoque à tout moment.
Aucun compte n'est créé pour le client.

## Ce que voit le client
| Onglet | Contenu | Action du client |
|---|---|---|
| Documents | devis et factures émis à son nom (pas les brouillons, pas les annulés) | ouvrir (accusé de lecture), accepter un devis (nom + case cochée), demander une modification, refuser, imprimer, télécharger les pièces jointes non confidentielles |
| Projets | projets marqués « partagés avec le client » : avancement, tâches et échéances, livrables | valider un livrable ou demander une correction (avec son nom) |
| Messages | fil de discussion avec l'équipe | écrire un message |
| Fichiers | fichiers qu'il a déposés | déposer un fichier (si `depot_fichiers` est activé) |
| Rendez-vous (lot P2, module Agenda actif) | ses rendez-vous, pris par lui ou par l'équipe | confirmer, annuler avant l'heure, déplacer ou prendre un rendez-vous (si `rdv_en_ligne` est coché) |
| Aide (lot P2, module Support actif) | articles d'aide que l'équipe a publiés aux clients | chercher, lire |

En haut de l'espace, un encadré résume ce qui attend le client : messages de l'équipe depuis sa visite précédente,
documents jamais ouverts, livrables à valider.

Lot E2 : un devis ou une facture présenté dans la devise du client affiche aussi « Soit … » avec le taux et sa date ;
le montant à régler reste celui de l'établissement.

## Rendez-vous en ligne (lot P2)
Réglages du module (Paramètres › Modules › Espace client) : `rdv_en_ligne` (non par défaut), `rdv_duree_minutes` (60),
`rdv_jours` (`1,2,3,4,5` : 1 = lundi … 7 = dimanche), `rdv_heure_debut` (09:00), `rdv_heure_fin` (18:00),
`rdv_delai_heures` (24 : délai minimum pour prendre ou déplacer), `rdv_horizon_jours` (21). Un réglage mal saisi
retombe sur sa valeur par défaut. Les heures sont celles du **fuseau de l'établissement**, affiché au client.

Un créneau est libre quand aucun rendez-vous prévu ou confirmé de l'établissement ne le chevauche. Le rendez-vous pris
en ligne est « prévu », sans personne attribuée, marqué « Pris en ligne » dans l'Agenda ; l'équipe (droit
`agenda.gerer`) est prévenue de chaque prise, confirmation, annulation ou report. Un rendez-vous déplacé redevient
« prévu » : l'équipe le reconfirme. Deux prises simultanées du même créneau sont impossibles (verrou par
établissement).

## Base d'aide publiée (lot P2)
Support › Réponses et aide : un **article d'aide** peut être coché « Publier aux clients ». Les réponses types ne se
publient jamais. Un article archivé disparaît de l'espace client.

Chaque action est tracée (`portail_evenements`) et notifie l'équipe (droit `portail_client.gerer`).

## Côté équipe (Relations › Espace client)
Liste des clients avec un espace, filtres « Messages non lus » et « Fichiers à traiter » ; fiche client : Messages
(répondre), Fichiers déposés (télécharger, marquer traité), Liens d'accès (révoquer), Projets partagés, Journal.

## Droits
| Droit | Rôles | Usage |
|---|---|---|
| `portail_client.lire` | gérant, responsable, commercial, collaborateur, lecteur | voir la page, les messages, le journal |
| `portail_client.gerer` | gérant, responsable, commercial | créer / révoquer un lien, répondre, traiter un dépôt, partager un projet (avec `projets.gerer`) |

Fonctions appelables sans connexion (rôle anon), toutes protégées par le jeton : `portail_ouvrir`, `portail_document_vu`,
`portail_repondre_devis`, `portail_decider_livrable`, `portail_envoyer_message`, `portail_deposer_fichier`,
`portail_telecharger`, et au lot P2 `portail_agenda`, `portail_demander_rdv`, `portail_confirmer_rdv`,
`portail_annuler_rdv`, `portail_deplacer_rdv`, `portail_aide`. Internes : `portail_rdv_reglages`, `portail_creneaux`,
`portail_rdv_du_client`. Un jeton expiré, révoqué ou inconnu reçoit la même erreur.

## Bilans, maintenances, recommandations (lot H2)
- **Bilans de collaboration** (`bilans_client`, droit `portail_client.gerer`) : brouillon chiffré par la base
  (`calculer_bilan_client` : factures, paiements, reste à payer, devis acceptés, projets, livrables validés, tickets,
  rendez-vous tenus, messages ; seulement les modules actifs), synthèse et prochaines actions écrites par l'équipe,
  publication (`publier_bilan_client`), accusé de lecture (`portail_bilan_vu`), retrait. Un bilan publié ne se modifie
  plus. Réglage `bilan_periodicite_mois` (3 par défaut, 0 = aucun rappel) : filtre « Bilan à préparer »
  (`bilans_a_preparer`).
- **Maintenances annoncées** (module Support) : en cours ou à venir dans les 30 jours, annulées depuis moins de 7 jours
  avec leur motif, dans le fuseau de l'établissement.
- **Recommander** (module Fidélité, réglage `parrainage_espace_client`) : le client recommande une personne (nom et
  téléphone ou e-mail) et suit ses recommandations. La réponse est la même que la personne soit connue ou non ; 5 par
  jour et par lien. Voir docs/FIDELITE.md.
- Fonctions anon ajoutées : `portail_suivi`, `portail_bilan_vu`, `portail_recommander`.

## Sécurité
- Le jeton n'est jamais stocké en clair ; la colonne `jeton_empreinte` et le contenu des dépôts ne sont pas lisibles par
  l'interface (droits par colonne).
- Le client ne voit que ses documents, et seulement les projets partagés explicitement.
- Limites par lien et par 24 heures : 30 messages, 10 dépôts, 20 réponses par type, 5 prises et 5 reports de rendez-vous,
  10 annulations.
- Dépôts : PDF, images, texte, CSV, Word, Excel, PowerPoint ; 3 Mo au plus par fichier.
- Rien ne se supprime ; l'anonymisation d'un contact efface aussi ses messages, notes, noms de signataire et dépôts.

## Limites connues
- Le lien est un lien « porteur » : quiconque le reçoit peut ouvrir l'espace jusqu'à son expiration ou sa révocation.
- Aucune notification par e-mail ou SMS au client : l'équipe envoie le lien elle-même (copier, WhatsApp).
- L'acceptation en ligne est une acceptation simple (nom + case), pas une signature électronique à valeur légale.
- Un projet partagé montre le titre de toutes ses tâches.
- Rendez-vous en ligne : une seule file pour tout l'établissement (pas de choix de la personne ni de la prestation,
  pas de fermetures exceptionnelles ni de pause de midi : réduire les heures ou bloquer le créneau par un rendez-vous).
- Aucun rappel de rendez-vous envoyé au client, pas de réglage de fréquence ni d'envoi selon son fuseau : il faut d'abord
  un canal d'envoi (e-mail ou SMS) branché (lignes 66 et 67 de la demande des 150, bloquées).
- Bilan : chiffres d'un seul établissement, sans comparaison avec la période précédente ni graphique ; le client réagit
  par « Messages » (pas de commentaire sur le bilan lui-même). Aucun envoi du bilan par e-mail.
- Maintenance : annonce pour tous les clients de l'établissement (pas de ciblage par client ou par service).

## Tests
`tests/espace_client.test.js` (droits, isolation entre établissements, jeton expiré ou révoqué, limites, dépôts
refusés, anonymisation), `tests/espace_client_rdv.test.js` (créneaux, fuseau, double réservation, report, délai,
isolation, aide publiée), `tests/parrainage_bilan_maintenance.test.js` (bilans, maintenances, recommandations), `tests/audit_offensif.test.js` (liste des fonctions anon), parcours navigateur étapes
`espace-client`, `espace-client-rdv` et `propositions-parrainage-bilan`.
