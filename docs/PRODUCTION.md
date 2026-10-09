# Production (module M04, Bêta)

Migration `20261010000105_production.sql`, écran `src/modules/production/`, page `#/production` (menu Catalogue et
stock), tableau de bord « Production » (`cockpit_production`). Mode d'emploi : SOP 62.
Proposé dans Commerce, Restaurant, Hôtel, E-commerce et Services, **jamais activé d'office**.

## Parcours
1. **Recette** (`prod_nomenclatures`) : un produit fini suivi en stock, la quantité obtenue, ses composants (articles
   suivis en stock du même établissement, quantités). Une recette par produit ; elle se modifie ou se désactive.
2. **Ordre de fabrication** (`prod_ordres`, `OF-00001`) : recette, quantité, Hub de fabrication, date prévue.
3. **Terminer** : la base calcule les besoins (quantité ÷ quantité de la recette × composant), vérifie le stock du Hub,
   puis en une seule opération : sorties `production_sortie` des composants, entrée `production_entree` du produit
   fini au coût des composants (si tous les coûts d'achat sont connus). La quantité réellement fabriquée peut différer.
4. **Annuler** : seulement un ordre planifié, avec motif ; rien n'a bougé dans le stock.

## Droits
| Droit | Rôles |
|---|---|
| `production.lire` | gérant, responsable, responsable de Hub, gestionnaire dépôt, comptable, lecteur |
| `production.produire` | gérant, responsable, responsable de Hub, gestionnaire dépôt |
| `production.gerer` (recettes) | gérant, responsable |

Un membre limité à certains Hubs ne voit et ne fabrique que dans ces Hubs.

## Réglage
« Autoriser la fabrication même si un composant manque en stock » (défaut : non).

## Limites connues
- Pas de recette à plusieurs niveaux (un produit fini n'est pas recalculé s'il sert lui-même de composant).
- Pas de fabrication partielle en plusieurs fois ni de pertes (rebuts) saisies à part : saisir la quantité réelle.
- Pas de planification de capacité (machines, équipes) ni de coût de main-d'œuvre.
- Le coût d'achat de l'article fini n'est pas mis à jour automatiquement (coût noté sur le mouvement et l'ordre).
- Une recette ne se supprime pas : on la désactive.
