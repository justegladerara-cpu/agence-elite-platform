# SOP 40 · Déclarer les capacités Hub d'un module

Un Hub (boutique, dépôt) a des capacités : `vente`, `stock`, `caisse`, `transfert`.
Un module déclare celles qu'il utilise dans `modules.capacites_hub` (migration), par ex. `caisse` → `{caisse,vente}`.

- Écrans : masquer une action quand le Hub choisi n'a pas la capacité (`hub.capacite_caisse`…).
- Base : la RPC du module vérifie la capacité du Hub (ex. ouverture de caisse refusée sur un dépôt sans caisse).
- **Une chambre d'hôtel, une table de restaurant ou une salle de classe n'est pas un Hub** : ce sont des
  données du module (`hotel_chambres`, `restaurant_salle`…), rattachées à un Hub.
