# SOP 80 — Réception intelligente : conditionnements et prix retenus (2026-10-12)

Demande de Juste : « Elite Simple », réception intelligente, mémorisation des conditionnements et des prix.
Migration `20261012000130_reception_intelligente.sql`, écran Stock › « J'ai reçu de la marchandise ».

## Ce que fait l'écran
1. Choisir le **fournisseur** (facultatif) et noter le **n° du bon** (facultatif).
2. Pour chaque article : choisir le **conditionnement** (à l'unité, casier, carton… ; « autre » pour en créer un),
   taper la quantité. Le **prix payé** est déjà proposé (dernier prix chez ce fournisseur) : on ne le tape que s'il change.
3. Les **alertes** s'affichent tout de suite : prix d'achat en hausse ou en baisse (≥ 5 %), vente à perte, marge
   sous 10 %. Le bouton « vendre à X » applique le prix de vente conseillé (arrondi à 5, 25 ou 50 F).
4. « **Refaire la dernière livraison** » remplit les lignes de la dernière livraison de ce fournisseur.
5. Paiement : pas encore payé / payé en entier / payé en partie (+ mode). Un seul bouton valide tout.

## Ce que fait la base (`recevoir_marchandise`)
- Bon de réception `BR-xxxxx` (définitif, jamais modifié), mouvements de stock, coût d'achat mis à jour.
- Conditionnement et prix **retenus** par article et fournisseur (`conditionnements_articles`) ; `oublier_conditionnement` les efface.
- Avec un fournisseur, un montant et le module Achats : commande fournisseur « reçue » (`BC-`), réception (`RE-`)
  et paiement éventuel → « À qui je dois ? » est à jour sans double saisie.
- Droits : `stock.ajuster` pour recevoir ; `articles.gerer` pour changer un prix de vente ; `achats.gerer` pour payer.
- `p_simulation = true` : calcule les alertes sans rien écrire.

## Liste des réceptions
Stock › onglet « Réceptions » : numéro, date, fournisseur, montant, reste à payer, alertes.

## Pas fait
Lecture d'une photo de facture (OCR) : aucun service de lecture choisi ; la saisie reste à la main, prix pré-remplis.
