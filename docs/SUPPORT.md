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

## Support avancé (migration `20261010000111_support_avance.sql`, lot A de la demande des 150 fonctions)
- **Nature** du ticket : demande, question, incident, réclamation (filtre dans la liste).
- **Réponses et aide** (`support_bibliotheque`) : réponses types insérées dans la réponse en un clic, articles d'aide
  pour l'équipe ; archivées, jamais supprimées ; écriture réservée au droit `gerer`.
- **Affectation automatique** (réglage « Assigner chaque nouveau ticket… », désactivé par défaut) : la personne qui
  traite les tickets et en a le moins en cours ; un choix fait à la main l'emporte ; la règle est notée au ticket.
- **Escalade** (motif obligatoire) : priorité +1 (l'urgente reste urgente), échéance relancée, responsables prévenus.
- **Tickets proches** : jusqu'à 5 tickets du même client (fiche ou téléphone) ou avec des mots du sujet en commun.
- **Rendez-vous depuis un ticket** (module Agenda actif et droit `agenda.gerer`) : client repris, trace au ticket.
- **Avis du client sur la solution** : « Le client confirme » ferme le ticket ; « Pas résolu pour le client » le rouvre
  avec ce qu'il signale.
- **Satisfaction** (1 à 5, une fois) sur un ticket résolu ou fermé ; moyenne sur 90 jours dans le tableau de bord.
- **Délai de première réponse** : calculé depuis la première réponse au client (hors notes internes), 90 jours.
- **WhatsApp prérempli** : bouton « Ouvrir dans WhatsApp » (lien `wa.me`, aucun fournisseur) avec le texte saisi ; la
  réponse s'enregistre ensuite dans le ticket. Un numéro sans indicatif international est signalé.

## Maintenances planifiées (lot H2)
- `support_maintenances` (droit `support_tickets.gerer`) : titre visible par les clients, début, fin (14 jours au
  plus), impact (interrompu, en partie indisponible, ralenti), description. Changer les horaires vaut nouvelle annonce.
- Préavis réglable (`maintenance_preavis_heures`, 48 h par défaut) : l'écran signale une annonce trop tardive, sans
  la bloquer (une urgence reste annonçable).
- L'équipe (droit `traiter`) est prévenue ; l'annonce s'affiche en haut de la page Support et à l'ouverture d'un ticket
  (en cours ou dans les 48 heures), et dans l'espace de chaque client (30 jours avant au plus).
- Annulation avec motif, affiché aux clients pendant 7 jours. Rien ne se supprime.

## Limites connues
- L'avis et la satisfaction sont saisis par l'équipe (le client n'a pas encore d'espace : lot P « Espace client »).
- Aucune réception automatique des e-mails ou WhatsApp et aucun envoi automatique : fournisseurs non choisis.
- Les tickets proches se trouvent par mots du sujet (pas de recherche « intelligente »).
- Maintenance : pas de page publique d'état du service ni d'envoi aux clients ; annonce visible dans l'espace client seulement.

## Écrans
Support › liste (filtres À traiter, En retard, Mes tickets, Escaladés, statut, priorité, nature), Réponses et aide, fiche du ticket (échanges, suivi,
assignation, pièces jointes). Widget de tableau de bord (ouverts, en retard, urgents, non assignés).

## Droits
`support_tickets.lire / traiter / gerer`. Gérant, responsable : tout. Responsable Hub, commercial, employé,
réceptionniste, collaborateur : lire et traiter. Lecteur : lecture.

## Démo
« Commerce Démo » : un ticket résolu, un en cours (priorité haute, note interne), un nouveau non assigné.

## Hors périmètre
Portail client en libre-service, réception automatique des e-mails ou WhatsApp (fournisseurs non choisis).
