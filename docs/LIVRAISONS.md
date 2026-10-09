# Livraisons (module M05, Bêta)

Migration `20261010000107_livraisons.sql`, écran `src/modules/livraisons/`, page `#/livraisons` (menu Vente), tableau
de bord « Livraisons » (`cockpit_livraisons`), nouveau rôle **Livreur**. Mode d'emploi : SOP 64. Proposé dans
Commerce, Restaurant, E-commerce et Services, **jamais activé d'office**.

## Parcours
1. **Créer** (`liv_livraisons`, `LV-00001`) depuis :
   - une **vente** validée (client, Hub et reste à payer repris) ;
   - une **commande en ligne** avec livraison (nom, téléphone, adresse repris) ;
   - une **facture** émise ;
   - ou à la main (avec ou sans fiche client ; l'adresse du contact est reprise si elle existe).
   Une même vente, commande ou facture ne peut avoir qu'une livraison active.
2. **Tournée** (`liv_tournees`, `TO-00001`) : un livreur, une date, plusieurs livraisons. Terminée automatiquement
   quand toutes ses livraisons sont closes.
3. **Avancer** : Prête → Partir (en route, compte les tentatives) → **Livrée** (nom de la personne qui reçoit,
   montant encaissé et mode) ou **Échec** (motif). Un échec se replanifie (date, livreur).
4. **Annuler** : avant le départ, avec motif.

## Droits
| Droit | Rôles |
|---|---|
| `livraisons.lire` | gérant, responsable, responsable de Hub, livreur, caissier, comptable, lecteur |
| `livraisons.livrer` | gérant, responsable, responsable de Hub, livreur, caissier |
| `livraisons.gerer` | gérant, responsable, responsable de Hub |

Un livreur (ou caissier) sans le droit de gérer **ne voit et ne fait avancer que les livraisons qui lui sont confiées**
(règle de lecture de la base, `liv_peut_voir`).

## Réglage
« Exiger le nom de la personne qui reçoit » (défaut : oui).

## Limites connues
- L'argent encaissé à la livraison est **noté sur la livraison**, il n'entre pas dans la caisse ni dans la clôture,
  et il ne solde pas automatiquement la vente ou la facture d'origine.
- Le statut de la commande en ligne d'origine n'est pas mis à jour automatiquement (à faire dans Boutique).
- Pas de carte, d'itinéraire optimisé, de suivi GPS ni de photo ou signature comme preuve.
- Pas de message automatique au client (viendra avec l'intégration WhatsApp ou SMS).
- Frais de livraison : pas de calcul ici (ceux de la boutique en ligne restent dans la commande).
