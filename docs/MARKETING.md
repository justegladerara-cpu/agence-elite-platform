# Marketing (module M03, Bêta)

Migration `20261010000110_marketing.sql`, écran `src/modules/marketing/`, page `#/marketing` (menu Relations,
libellé « Marketing »), tableau de bord « Marketing » (`cockpit_marketing`). Mode d'emploi : SOP 67. Proposé dans
toutes les solutions, **jamais activé d'office**. Dépend du module Contacts.

## Parcours
1. **Accords des contacts** (`mkt_consentements`) : pour chaque contact et chaque canal (e-mail, SMS, WhatsApp),
   « accepte » ou « refuse », avec la preuve (comment la réponse a été donnée). Sans accord, pas de message.
2. **Segments** (`mkt_segments`) : types de contact, a acheté dans les N derniers jours, n'a plus acheté depuis
   N jours, total des achats minimum. « Compter les contacts » (`apercu_segment`) donne le nombre joignable par canal.
3. **Campagne** (`mkt_campagnes`, numéro `CP-00001`) : canal, segment, objet (e-mail), message. Modifiable tant
   qu'elle est en brouillon.
4. **Préparer** (`preparer_campagne`) : fige la liste des destinataires (`mkt_destinataires`) : contacts actifs du
   segment, accord donné pour ce canal, coordonnée valide. La liste ne change plus ensuite.
5. **Envoyer** : l'envoi par un service (e-mail, SMS, WhatsApp) est **Bloqué** tant que l'intégration du canal
   n'est pas branchée (voir `docs/INTEGRATIONS.md`). En attendant : exporter la liste, envoyer depuis l'outil
   habituel, puis **Déclarer l'envoi fait** (`declarer_envoi_campagne`, avec une note).
6. **Annuler** (`annuler_campagne`) : brouillon ou prête, avec motif.

## Droits
| Droit | Rôles |
|---|---|
| `marketing.lire` | gérant, responsable, commercial, lecteur |
| `marketing.gerer` | gérant, responsable, commercial |

## Réglages
« Signature » (vide) et « Mention pour ne plus recevoir de messages » (« Pour ne plus recevoir nos messages,
répondez STOP. ») : affichées avec le message, à reprendre lors de l'envoi.

## Limites connues
- **Aucun envoi automatique** : les intégrations e-mail, SMS et WhatsApp sont « Bloqué » (fournisseur à choisir).
- Pas de suivi d'ouverture, de clic ni de réponse ; le suivi se limite au nombre de destinataires et à l'envoi déclaré.
- Un « STOP » reçu doit être saisi à la main (accord « refuse ») : rien ne le lit automatiquement.
- Pas de variables de personnalisation remplacées automatiquement (ex. le nom du contact).
- Pas de programmation à une date future.
