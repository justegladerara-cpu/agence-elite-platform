# Module Hôtel — chambres et réservations, solution « Hôtel »

Statut : **actif** (migration `20261003000001_hotel.sql`, modules `hotel_chambres` et `hotel_reservations`).
La solution **Hôtel** devient active : offre d'essai `hotel-complet` (chambres, réservations, facturation, caisse,
ventes, paiements, reçus, ticket Z, stock, contacts, dépenses) créée **à prix 0** — Agence Elite fixe les prix dans son
espace avant toute vente. Restaurant (SOP 49) et boutique de l'hôtel s'ajoutent comme Hubs avec leurs modules.

## Principe (réutilise les briques communes)
Hôtel → Réservation → Prestations → Facturation → Paiement.
- **Types de chambre** (`hotel_types_chambre`) : nom, capacité, tarif de la nuit.
- **Chambres** (`hotel_chambres`) : numéro, étage, type, **entretien** : propre, à nettoyer, en nettoyage, hors service (motif).
- **Réservation** (`hotel_reservations`, RS-) : client enregistré (contact) **ou** simple nom + téléphone, type,
  chambre (facultative jusqu'à l'arrivée), dates, personnes (capacité contrôlée), tarif (celui du type par défaut,
  modifiable), origine (sur place, téléphone, WhatsApp, site web, agence, plateforme).
  Statuts : confirmée → en séjour → partie ; annulée ou absent (no-show) avec motif.
- **Jamais de surréservation** : pour chaque nuit, réservations du type ≤ chambres utilisables du type (hors service
  exclues) ; une chambre attribuée n'a jamais deux séjours qui se chevauchent (verrou sur le type).
- **Arrivée** : à partir du jour prévu, chambre du bon type, **propre** et libre ; la date d'arrivée s'aligne sur le jour réel.
- **Prestations** (`hotel_prestations`) : article du catalogue (minibar, petit-déjeuner…) ou libre ; jamais modifiées,
  annulées avec motif pendant le séjour.
- **Départ** : facture émise (module Facturation, Hub principal) = nuits réellement passées (au moins une) + prestations ;
  le client de passage devient un contact ; la chambre passe « à nettoyer » (paramètre `menage_au_depart`) et l'équipe
  d'entretien est prévenue. Le paiement se fait sur la facture (SOP 45) ; une erreur se corrige par avoir.

## Droits
`hotel_chambres.lire / gerer / menage`, `hotel_reservations.lire / gerer / sejour`.
Gérant, responsable : tout. Responsable Hub : tout sauf gérer les chambres. Nouveaux rôles **Réceptionniste**
(réservations, séjours, entretien, contacts, facturation, caisse) et **Agent d'entretien** (état des chambres seulement,
ne voit aucune réservation). Caissier, comptable, lecteur : lecture.

## Fonctions
`enregistrer_type_chambre`, `enregistrer_chambre`, `changer_menage_chambre`, `enregistrer_reservation_hotel`,
`annuler_reservation_hotel`, `check_in_hotel`, `ajouter_prestation_hotel`, `annuler_prestation_hotel`, `check_out_hotel`,
`disponibilites_hotel` (par type et par nuit, 92 jours au plus), `tableau_de_bord_hotel`.
Interne : `verifier_disponibilite_hotel`, trigger `proteger_prestation_hotel`.

## Écrans
- **Réception** (`#/hotel`) : occupation, arrivées, départs, chiffre du mois ; onglets Aujourd'hui (arrivées, départs,
  en séjour), **Planning** (14 jours × chambres, clic sur une case libre = nouvelle réservation), Réservations (recherche, filtre).
- **Fiche séjour** (`#/hotel/<id>`) : Arrivée (choix de la chambre propre), Prestation, Départ et facture, Facture,
  Modifier, Absent, Annuler, documents joints.
- **Chambres** (`#/chambres`) : Entretien (cartes : Commencer, Propre, Hors service), Chambres, Types et tarifs.
- Widget « Hôtel » sur le tableau de bord.

## Démo
« Hôtel Démo » (client Commerce Démo) : 7 chambres, 2 séjours en cours, 1 départ facturé et payé, 1 arrivée attendue,
1 absence, 2 réservations à venir, 1 chambre à nettoyer, 1 hors service. Comptes fictifs `hotel@`, `reception@`,
`menage@demo.agence-elite.fr` ; Patrondemo y est gérant.

## Limites connues (évolutions futures)
- Pas d'acompte encaissé avant l'arrivée (le paiement se fait sur la facture de départ).
- Pas de tarifs saisonniers ni de tarif par nombre de personnes (tarif par type, modifiable par réservation).
- Pas de report des notes du restaurant sur la chambre (le restaurant encaisse à part).
- Pas de connexion aux plateformes de réservation en ligne (channel manager) ni de taxe de séjour automatique
  (règle locale non définie).
