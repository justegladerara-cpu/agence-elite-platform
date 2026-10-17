# SOP 85 — Bars et restaurants : happy hour, offerts, pourboires, alerte de stock, commande WhatsApp (2026-10-13)

Migration `20261017000135_offerts_happyhour_pourboires.sql` (une seule, additive). `enregistrer_vente` n'est pas
modifiée : elle accepte déjà une remise par ligne. Tests : `tests/offerts_happyhour_pourboires.test.js` (base PGlite et
règles pures) et `tests/offerts_happyhour_ecrans.test.jsx` (fenêtres « Offrir » et « Encaissement »).

| Écran | Adresse | Droit | Rôles |
|---|---|---|---|
| Happy hour (réglages) | `#/happy-hour` | `caisse.happy_hour` | gérant, responsable |
| Offerts et pertes (rapport) | `#/offerts-pertes` | `caisse.offerts_pertes` | gérant, responsable, comptable |
| Bouton « Offrir » dans le panier | Caisse | `caisse.remise_libre` (existant) | gérant, responsable |
| Pourboire à l'encaissement | Caisse | `caisse.utiliser` | toute personne qui encaisse |
| Préparer la commande | `#/preparer-commande` (bouton dans Stock) | `stock.lire` | qui voit le stock |

## 1. Happy hour (prix par horaire)
1. Caisse › **Happy hour** › « Nouveau happy hour » : nom, jours (gros boutons Lun…Dim), de / à, réduction en %,
   catégories (aucune = tout le catalogue), case « Actif ».
2. Un créneau peut **passer minuit** (ex. 22:00 à 02:00) : réglé le vendredi, il court du vendredi 22:00 au samedi 02:00.
3. Pendant le créneau, la caisse affiche **« Happy hour : -X % jusqu'à HH:MM »** et met la remise sur chaque ligne
   concernée (prix barré dans le panier, ligne « Happy hour » dans les totaux). Arrondi au franc en FCFA.
4. « Désactiver » éteint un créneau sans le perdre ; rien ne se supprime.
5. Plafond de remise (Paramètres › Caisse) : la part due au happy hour **n'est pas comptée** (5 minutes de marge si le
   panier a été préparé juste avant la fin du créneau). Le reste de la remise reste plafonné.
- Règle unique : `src/modules/caisse/happyHour.js` (écran) = `public.pourcentage_happy_hour` (base, heure de
  l'établissement). L'écran utilise l'heure de l'appareil de la caisse.
- Hors champ : la Salle (module Restaurant) n'applique pas encore le happy hour ; il vaut pour la Caisse.

## 2. Offerts avec raison
1. Dans le panier, bouton **« Offrir »** sur la ligne (gérant, responsable). Raison obligatoire : « Client fidèle »,
   « Geste commercial », « Erreur de service », « Patron », « Autre » (précision obligatoire pour « Autre »).
2. Ligne de plusieurs articles : « Combien offrir ? » ; le reste reste payant.
3. « Ne plus offrir » remet la ligne au prix normal.
4. À la vente : la ligne part avec une remise égale à son prix (total 0), la note de la vente reçoit
   « Offert : 1 × Primus (Client fidèle) », puis `enregistrer_offerts_vente` garde la raison dans la table `offerts`
   (liée à la ligne de vente). Si cette seconde étape échoue, la vente reste valable et la note garde la raison.
- Un offert n'est pas gardé dans une « Facture en cours » : refaire « Offrir » à l'encaissement.

## 3. Pourboires par serveur
- Fenêtre d'encaissement › **« + Pourboire »** : montant, Espèces ou Mobile Money. Le serveur est celui de « Servi par ».
- Simple information (table `pourboires`) : **ni le total de la vente, ni le ticket Z, ni les espèces attendues ne
  changent**. Un pourboire par vente ; il ne se modifie pas.

## 4. Rapport « Offerts et pertes »
Période (aujourd'hui, 7 jours, 30 jours ou dates choisies, un an au plus) :
- **Offerts** : quand, quoi, raison, qui a offert, valeur au prix de vente (export CSV).
- **Remises** : lignes remisées (happy hour compris) et remises sur le ticket.
- **Pertes** : retraits du stock (Stock › « J'ai perdu / cassé / périmé »), valeur au prix d'achat.
- **Pourboires par serveur et par jour** : espèces, Mobile Money, total.
Les ventes annulées ne comptent pas. Fonction : `rapport_offerts_pertes(établissement, du, au)`.

## 5. Alerte stock dans la caisse et commande WhatsApp
- Tuile de la caisse : **« Plus que N »** quand le stock est au **stock minimum** (`articles.stock_minimum`) ou en dessous.
  Sans minimum réglé sur l'article : aucune alerte.
- Stock › **« Préparer la commande »** : articles au minimum ou en dessous, regroupés par fournisseur (celui retenu par la
  Réception intelligente), quantité proposée = double du minimum moins le stock, en casiers/cartons entiers quand le
  conditionnement est connu. Quantités modifiables, message prêt, **« Envoyer sur WhatsApp »** (lien `wa.me`, avec le
  numéro du fournisseur s'il est connu, sinon `wa.me/?text=…`) ou **« Copier le texte »**. Aucune API WhatsApp, aucune
  commande créée : la personne relit et envoie.

## Garde-fous
- Écriture uniquement par fonctions `security definer` (`enregistrer_happy_hour`, `enregistrer_offerts_vente`,
  `enregistrer_pourboire`) ; lecture par RLS. Tables sans suppression ; offerts et pourboires immuables.
- Un caissier sans `caisse.remise_libre` ne peut pas enregistrer d'offert (refus de la base, pas seulement bouton caché).
- Démo : Restaurant Démo (2 happy hours, 1 Primus offert « Client fidèle », 500 FCFA de pourboire pour Rodrigue) et
  Commerce Démo (« Fin de journée », -10 % sur les boissons). Données fictives.

## Mise en production
Base d'abord : appliquer la migration 135 (workflow « Déploiement de la base ») **avant** de fusionner le code qui appelle
`enregistrer_offerts_vente`, `enregistrer_pourboire`, `rapport_offerts_pertes` et lit `happy_hours`.
