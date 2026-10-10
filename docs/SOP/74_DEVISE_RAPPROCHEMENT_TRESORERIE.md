# SOP 74 — Devise du client, taux de change, rapprochement des relevés, trésorerie prévue

**Qui :** gérant, responsable, comptable. **Où :** Devis et factures, Rapprochement, Pilotage. Aucune connexion
bancaire : les relevés s'importent à la main depuis un fichier exporté par la banque ou l'opérateur Mobile Money.

## Saisir un taux de change (droit `facturation.gerer`)
1. Devis et factures › onglet **Taux de change** › **Saisir un taux**.
2. Devise du client (code à 3 lettres, ex. EUR, USD), date du taux, valeur de 1 unité dans la devise de
   l'établissement, source (banque, taux officiel…).
3. Un taux ne se modifie ni ne se supprime : une correction est une nouvelle saisie (l'historique reste lisible).

## Présenter un devis ou une facture dans la devise du client
1. Ouvrir le document **avant l'émission** (brouillon, ou devis envoyé) › menu ⋯ › **Devise du client…**.
2. Choisir le taux (le plus récent à la date du document est proposé en premier) › **Appliquer**.
3. Le document affiche « Soit … » dans la devise du client avec le taux, sa date et sa source, à l'écran, à
   l'impression et dans l'espace client. Le taux est **figé** : la facture née du devis, la nouvelle version et
   l'avoir le reprennent.
4. Le montant compté (vente, paiements, rapports, comptabilité) reste **dans la devise de l'établissement**.

## Rapprocher un relevé (droit `paiements.rapprocher`)
1. Exporter le relevé de la banque ou du compte Mobile Money en CSV (colonnes date, libellé, référence, montant ;
   ou débit / crédit). Un modèle se télécharge depuis la fenêtre d'import.
2. Rapprochement › **Importer un relevé** › nom du compte, ordre des dates, fichier. L'aperçu montre le nombre de
   lignes, les entrées, les sorties et les lignes illisibles (non envoyées). Une ligne déjà importée est ignorée.
3. Onglet **À rapprocher** : pour chaque ligne, les mouvements de même montant à 10 jours près (paiements reçus hors
   espèces, paiements fournisseurs, dépenses), « Référence retrouvée » en tête. **Rapprocher** sur le bon.
4. Ligne sans mouvement : enregistrer le paiement ou la dépense oublié(e), ou **Écarter** avec une raison (frais
   bancaires, virement interne…).
5. Onglet **Paiements sans relevé** : paiements des 60 derniers jours pas encore retrouvés sur un relevé (à vérifier).
6. Erreur : onglet **Traitées** › **Défaire**.

## Lire la trésorerie prévue (droit `rapports.pilotage`)
1. Pilotage › onglet **Trésorerie prévue**. Saisir la trésorerie disponible aujourd'hui et l'horizon.
2. Trois scénarios : prudent, central, optimiste. Chacun montre le solde en fin de période, le point le plus bas et la
   première semaine négative.
3. **Régler les scénarios** : part encaissée, retard des clients, niveau des dépenses courantes. Rien n'est enregistré.

## Ce qu'il ne faut pas faire
- Saisir un taux « au jugé » : noter la source.
- Changer la devise d'un document après l'avoir envoyé au client sans le prévenir.
- Rapprocher un mouvement « parce que le montant colle » sans vérifier la date et le libellé.
- Prendre la prévision pour un engagement : les ventes au comptoir à venir n'y sont pas.
