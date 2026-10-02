# SOP 27 · Déplacer du stock entre Hubs

Page **Transferts** → **Nouveau transfert** (visible dès qu'il y a deux Hubs).

1. Hub de départ, Hub d'arrivée (différents), lignes article + quantité, motif.
2. Valider : la base vérifie le stock disponible au départ, puis enregistre en une seule opération
   une sortie au départ et une entrée à l'arrivée (numéro `TR-…`).
3. Erreur de saisie : ouvrir le transfert → **Annuler** avec motif. Le stock revient, rien n'est effacé.

Droit nécessaire : `stock.transferer` (Responsable d'établissement, Gestionnaire dépôt…) et accès aux deux Hubs.
