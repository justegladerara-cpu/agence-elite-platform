# Assistant (module M10, Bêta)

Migration `20261010000104_assistant.sql`, écran `src/modules/assistant/`, page `#/assistant` (menu Pilotage).
Droit `assistant.lire` (gérant, responsable). Proposé dans toutes les solutions, **jamais activé d'office** : Agence
Elite l'accorde par la licence, comme les autres options. Mode d'emploi : SOP 61.

## Ce que fait l'assistant
Une seule liste « À regarder », triée du plus urgent au moins urgent, avec un lien vers l'écran concerné :
1. **Les alertes de tous vos tableaux de bord** (stock, caisse, factures, hôtel, restaurant, RH, CRM, achats…), mais
   seulement celles que l'utilisateur a le droit de voir (`cockpit_domaines`).
2. **Deux contrôles propres à l'assistant** :
   - annulations répétées par une même personne (au moins N ventes annulées sur la période) ;
   - ventes avec une remise forte (remise globale + remises de lignes ≥ X % du montant avant remise).

## Réglages (Paramètres › Applications › Assistant)
| Réglage | Défaut |
|---|---|
| Nombre de jours analysés (1 à 90) | 7 |
| Annulations par une même personne avant alerte | 3 |
| Remise (en %) jugée forte | 30 |

## Sécurité
- Fonction `assistant_alertes` en **security invoker** : chaque table garde sa RLS (établissement, Hub, rôle, licence).
- Refus sans le droit `assistant.lire`, refus pour un autre établissement, refus pour un visiteur anonyme.
- Lecture seule : rien n'est écrit (test `tests/assistant.test.js`).
- `assistant_reglage` ne renvoie un réglage qu'à qui a le droit de voir l'assistant.

## Limites connues
- Pas d'intelligence artificielle générative : aucun fournisseur choisi. Les alertes sont des calculs simples.
- Pas de notification (e-mail, WhatsApp) : il faut ouvrir l'écran. Viendra avec les intégrations Messages.
- On ne peut pas encore « masquer » une alerte déjà vue.
- Un tableau de bord qui échoue est ignoré et nommé en bas de l'écran (« Non analysé pour l'instant »).
- Contrôles propres limités aux ventes (caisse, factures, boutique) ; rien encore sur les dépenses ou le stock
  au-delà des alertes des tableaux de bord.
