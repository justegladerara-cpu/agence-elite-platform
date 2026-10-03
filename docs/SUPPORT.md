# Module Support — tickets clients

Statut : **actif** (migration `20261003000005_support.sql`, module `support_tickets`). Proposé à toutes les solutions
comme **module accordé** par Agence Elite. Aucune offre payante n'a été modifiée.

## Principe
- **Ticket** (`support_tickets`, numéro `TK-…`) : sujet, description, client (contact ou nom + téléphone), canal
  (téléphone, WhatsApp, e-mail, sur place, site web, autre), priorité (basse, normale, haute, urgente), vente liée
  facultative, personne assignée, **échéance de réponse** calculée selon la priorité.
- **Délais** : Paramètres › Réglages des modules › Support (heures par priorité), par défaut 2 / 8 / 24 / 72 h (urgente → basse).
- **Échanges** (`support_messages`) : réponses au client et **notes internes** ; définitifs (ni modifiés ni supprimés).
  Chaque changement (statut, assignation) laisse une ligne d'historique.
- **Statuts** : ouvert → en cours → attente client → résolu (solution obligatoire) → fermé ; un ticket résolu ou fermé
  peut être rouvert. Pièces jointes (photos, bons) via la brique commune.
- La personne assignée doit avoir le droit de traiter les tickets ; elle est notifiée.

## Écrans
Support › liste (filtres À traiter, En retard, Mes tickets, statut, priorité), fiche du ticket (échanges, suivi,
assignation, pièces jointes). Widget de tableau de bord (ouverts, en retard, urgents, non assignés).

## Droits
`support_tickets.lire / traiter / gerer`. Gérant, responsable : tout. Responsable Hub, commercial, employé,
réceptionniste, collaborateur : lire et traiter. Lecteur : lecture.

## Démo
« Commerce Démo » : un ticket résolu, un en cours (priorité haute, note interne), un nouveau non assigné.

## Hors périmètre
Portail client en libre-service, réception automatique des e-mails ou WhatsApp (fournisseurs non choisis).
