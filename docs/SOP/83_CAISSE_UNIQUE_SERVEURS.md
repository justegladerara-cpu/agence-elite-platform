# SOP 83 — Une seule caisse ouverte, alerte ticket Z, serveurs, caisse sur tablette

**Qui :** caissière, gérant, responsable. **Où :** Caisse, Clôture de caisse, Tableau de bord, Paramètres › Réglages des
modules › Clôture. Demande de Juste pour le Dream (bar ouvert 24 h/24, une seule caisse physique), 2026-10-13.
Migration `supabase/migrations/20261013100133_caisse_unique_serveurs.sql`.

## Une seule caisse ouverte à la fois
- Par point de vente, une seule caisse ouverte. La caissière suivante ouvre **après le ticket Z** de la précédente.
- Si la caisse d'Awa est encore ouverte, Binta voit à l'ouverture « La caisse de Awa est encore ouverte (depuis le…) ».
- Le gérant ou un responsable (droit `cloture.cloturer`) voit **« Fermer la caisse de Awa »** :
  - en comptant le tiroir (ticket Z normal, au nom d'Awa) ;
  - ou **« Fermer sans compter »** : ticket Z au nom d'Awa avec « espèces à compter » ; Awa (ou un responsable) compte
    ensuite dans Clôture de caisse. Awa reçoit une notification.
- Réglage Clôture « caisse_unique » (oui par défaut). Le mettre à non seulement si plusieurs caisses physiques partagent
  le même point de vente ; mieux : créer un point de vente par caisse physique.

## Après minuit
- Rien ne change à minuit : les ventes restent sur la caisse de la caissière jusqu'à SON ticket Z, même à 3 h.
- Le tableau de bord compte **par service** : un service ouvert le 12 à 18 h et fermé le 13 à 3 h compte entièrement
  pour le 12, à la caissière qui l'a tenu.

## Factures en cours au ticket Z
- Si des clients consomment encore, la caissière peut tirer son Z : les factures en cours sont **notées sur le ticket Z**
  (« Factures en cours transmises ») et passent à la caissière suivante, qui les voit marquées « caisse précédente »
  et les encaisse sur SA caisse.

## Alerte « ticket Z non tiré »
- Réglages Clôture : « alerte_caisse_ouverte_heures » (12 par défaut) et « alerte_caisse_inactive_heures » (4 par
  défaut) ; 0 = jamais.
- Une caisse qui dépasse un seuil : notification (cloche) au gérant et aux responsables, rappel à la caissière, et
  encadré rouge dans le tableau de bord « Caissières et caissiers ». Une seule notification par caisse et par motif.
- En production, une tâche planifiée vérifie toutes les 15 minutes ; l'ouverture du tableau de bord vérifie aussi.

## Suivi en direct (gérant, responsable)
- Tableau de bord › « Caissières et caissiers » : « En caisse maintenant : Awa · depuis… · dernière vente il y a… »,
  montant et nombre de ventes du service, total de l'établissement ; se met à jour seul toutes les 30 secondes.

## Serveurs
- À la caisse, en haut du panier : les prénoms des serveurs en boutons. Toucher un prénom le choisit (le toucher encore
  l'enlève). Le choix est **facultatif** et reste sélectionné pour la commande suivante sur cette tablette.
- **« + Nouveau serveur »** : taper le prénom une seule fois ; il apparaît ensuite sur toutes les tablettes.
- Le serveur choisi est repris à l'encaissement (« Servi par ») et suit la facture en cours jusqu'au paiement.
- Tableau de bord › « Serveurs » : ventes et montant par serveur, article le plus servi. Le gérant y **fusionne un
  doublon** (« jean » dans « Jean » : les ventes passent au serveur gardé) et **désactive** un serveur parti
  (l'historique reste).

## Tablette
- Debout (portrait) : barre fixe en bas avec le panier et un gros bouton **Encaisser** : on encaisse sans ouvrir le panier.
- Couchée (paysage) : le pied du panier (total, Facture en cours, Encaisser) reste en bas de l'écran ; client et remise
  sont repliés dans « Client et remise ».
- Encaissement : gros boutons Espèces, Mobile Money, Carte… ; billets rapides ; « Payer avec deux moyens » si besoin.
- Conseil : installer la plateforme comme application sur la tablette (menu du navigateur › Installer) pour retirer
  la barre du navigateur.

## Ce qu'il ne faut pas faire
- Partager un même compte entre plusieurs caissières : le système ne peut plus dire qui a vendu. Un compte par personne.
- Fermer la caisse d'une autre personne « pour aller plus vite » : seulement une caisse oubliée.

Fonctions : `ouvrir_caisse`, `caisse_occupee`, `fermer_caisse_oubliee`, `activite_caissiers`, `alertes_caisses`,
`alerter_caisses_ouvertes` (interne), `enregistrer_serveur`, `indiquer_serveur_vente`, `indiquer_serveur_attente`,
`activer_serveur`, `fusionner_serveurs`, `statistiques_serveurs_caisse`. Tests : `tests/caisse_unique_serveurs.test.js`.
