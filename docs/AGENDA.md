# Module Agenda — rendez-vous et planning de l'équipe

Statut : **actif** (migration `20261003000004_agenda.sql`, module `agenda`). Inclus par défaut dans la solution Services
(l'offre d'essai `services-complet` le couvre) ; proposé aux solutions Commerce, Restaurant, Hôtel et E-commerce comme
**module accordé** par Agence Elite. Aucune offre payante n'a été modifiée.

## Principe
- **Rendez-vous** (`agenda_rendez_vous`, numéro `RV-…`) : client (contact existant ou nom + téléphone), objet, personne
  de l'équipe, prestation (article) et prix facultatifs, début, fin (ou durée), lieu, note.
- **Pas de double réservation** : une même personne ne peut avoir deux rendez-vous qui se chevauchent (verrou par
  personne dans la base, donc même si deux postes enregistrent en même temps).
- **Statuts** : prévu → confirmé → honoré, ou annulé / absent (motif obligatoire). Un rendez-vous clos ne se modifie plus
  et ne se supprime jamais. Honoré ou absent seulement une fois commencé ; on ne prend pas un rendez-vous dans le passé
  (tolérance d'un jour pour la saisie après coup).
- **Facturer** : un rendez-vous honoré avec prestation ou prix donne une **facture brouillon** (module Facturation), une
  seule fois ; elle s'émet et s'encaisse ensuite dans Facturation.
- La personne choisie est notifiée (lien vers le rendez-vous).

## Écrans
Agenda › **Semaine** (7 colonnes, navigation, « + » par jour), **Liste** (recherche, filtre de statut), filtre « Mes
rendez-vous » ou par personne, fiche (confirmer, honoré, absent, annuler, facturer, modifier). Widget de tableau de bord.

## Droits
`agenda.lire / gerer`. Gérant, responsable, responsable Hub, commercial, employé, réceptionniste, collaborateur : gérer.
Lecteur, comptable : lecture.

## Démo
« Commerce Démo » (accordé comme supplément) : un conseil honoré et facturé ce matin, trois rendez-vous à venir.

## Hors périmètre
Réservation en ligne par le client lui-même, rappels SMS (fournisseur SMS non choisi), synchronisation Google Agenda.
