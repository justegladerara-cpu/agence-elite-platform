# SOP 37 · Ajouter un widget au tableau de bord

Le tableau de bord ne connaît aucun module : il affiche les **widgets déclarés** par les manifestes
des modules activés, si la personne a la permission.

1. Composant dans `src/modules/<module>/widgets.jsx`. Il reçoit `{ tdb, periode, du, au, espace, naviguer }`.
   `tdb` = résultat de `tableau_de_bord_hub` (filtré par Hub et période côté base).
2. Déclaration dans le manifeste :
   `{ id: '<module>.<nom>', zone: 'indicateur' | 'section' | 'colonne', ordre, permission?, visible?, composant }`.
   - `indicateur` : une `StatCard` dans la grille du haut ;
   - `section` : bloc pleine largeur ; `colonne` : bloc de la grille à deux colonnes.
3. Besoin d'un chiffre que `tableau_de_bord_hub` ne donne pas : **nouvelle migration** qui remplace la fonction
   en ajoutant la clé (sans retirer les autres), filtrée par `lecture_hub` comme le reste.
4. Montants : toujours `espace.montant(n)`. Ne jamais présenter une donnée contractuelle comme de l'argent encaissé.
5. `tests/registre.test.jsx` : le widget doit appartenir à un module disponible ; ajouter un cas si la visibilité est conditionnelle.
