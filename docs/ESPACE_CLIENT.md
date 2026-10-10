# Espace client

Module `portail_client` (statut « Bêta », lot P, 2026-10-10, migration `20261010000118`). Dépend du module Contacts.
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
`portail_telecharger`. Un jeton expiré, révoqué ou inconnu reçoit la même erreur.

## Sécurité
- Le jeton n'est jamais stocké en clair ; la colonne `jeton_empreinte` et le contenu des dépôts ne sont pas lisibles par
  l'interface (droits par colonne).
- Le client ne voit que ses documents, et seulement les projets partagés explicitement.
- Limites par lien et par 24 heures : 30 messages, 10 dépôts, 20 réponses par type.
- Dépôts : PDF, images, texte, CSV, Word, Excel, PowerPoint ; 3 Mo au plus par fichier.
- Rien ne se supprime ; l'anonymisation d'un contact efface aussi ses messages, notes, noms de signataire et dépôts.

## Limites connues
- Le lien est un lien « porteur » : quiconque le reçoit peut ouvrir l'espace jusqu'à son expiration ou sa révocation.
- Aucune notification par e-mail ou SMS au client : l'équipe envoie le lien elle-même (copier, WhatsApp).
- L'acceptation en ligne est une acceptation simple (nom + case), pas une signature électronique à valeur légale.
- Un projet partagé montre le titre de toutes ses tâches.
- Pas encore livré (lot P2) : prise et report de rendez-vous en ligne, base d'aide publiée au client, centre et
  fréquence de notifications client, envoi selon le fuseau du client.

## Tests
`tests/espace_client.test.js` (droits, isolation entre établissements, jeton expiré ou révoqué, limites, dépôts
refusés, anonymisation), `tests/audit_offensif.test.js` (liste des fonctions anon), parcours navigateur étape
`espace-client`.
