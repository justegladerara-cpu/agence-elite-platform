# Module Fidélité — points et récompenses

Statut : **actif** (migration `20261003000008_fidelite.sql`, module `fidelite`, dépend de Contacts et Ventes). Proposé à
toutes les solutions comme **module accordé** par Agence Elite. Aucune offre payante n'a été modifiée.

## Principe
- **Gain automatique** : toute vente **validée** avec un client identifié (caisse, facture, boutique, restaurant,
  hôtel, abonnement) donne des points : `floor(total / tranche) × points par tranche` (défaut : 1 point par
  1 000). Calcul en fin de transaction, sur l'état final de la vente ; seul l'écart est inscrit, donc jamais de doublon.
- **Annulation** : une vente annulée retire ses points ; un client changé sur la vente les transfère.
- **Récompense** : « Utiliser les points » (minimum réglable, solde suffisant, récompense décrite). La remise ou le
  cadeau est accordé en caisse ; le motif garde la trace (ex. numéro du ticket).
- **Ajustement** (gérant) : ajout ou retrait motivé (reprise d'une carte papier, geste commercial). Le solde ne devient
  jamais négatif ; un verrou par client empêche deux caisses de dépenser les mêmes points.
- **Mouvements définitifs** (`fidelite_mouvements`) : ni modifiés ni supprimés, journalisés.
- Activation : seules les ventes faites **après** l'activation donnent des points (pas de reprise rétroactive).
  Module désactivé ou licence suspendue : les points acquis restent, plus aucun gain.

## Réglages (Paramètres › Réglages des modules › Fidélité)
Tranche d'achat, points par tranche, valeur d'un point en récompense (affichage), minimum de points pour une récompense.

## Droits
`fidelite.lire / utiliser / gerer`. Gérant, responsable : tout. Responsable Hub, employé, commercial, réceptionniste :
lire et utiliser. Lecteur, comptable : lecture.

## Démo
« Commerce Démo » : « Client fidèle Démo » (carte papier reprise, 100 points utilisés), l'hôtel (geste commercial).

## Hors périmètre
Remise appliquée automatiquement dans le ticket de caisse, carte ou QR code client, envoi de SMS de solde
(fournisseur SMS non choisi), expiration des points (règle commerciale non définie).
