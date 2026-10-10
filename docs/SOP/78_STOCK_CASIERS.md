# SOP 78 — Casiers, cartons et packs (boissons)

**Qui :** gérant, responsable (régler le casier d'un article : droit `articles.gerer`) ; toute personne qui saisit le
stock (droit `stock.ajuster`). **Où :** Articles (fiche de l'article) et Stock.
**Pour :** les articles **vendus à l'unité** mais **reçus et comptés par casier** (bière, soda, eau…).

## Régler une fois
1. Articles › ouvrir l'article (ou **Nouvel article**) › cocher **Suivre les quantités**.
2. **Unités par casier** : par exemple 24. **Nom du casier** facultatif : casier, carton, pack… (casier par défaut).
3. Enregistrer. Laisser vide pour un article qui ne se range pas en casier.

## Ensuite, au quotidien
- **J'ai reçu de la marchandise** ou **Je compte mon stock** : pour ces articles, deux cases, **casiers + unités**
  (ex. 5 casiers + 3 bouteilles). La colonne « Après » montre le résultat.
- Le stock s'affiche en **« 5 casiers + 3 »**. La caisse vend toujours à l'unité : rien ne change pour les caissiers.
- **Fichier de stock** : colonnes facultatives `casiers` et `par_casier` (voir `docs/modele_stock.csv`). La quantité
  devient casiers × par_casier + quantite. `par_casier` sert pour un article qui n'a pas encore de casier : il est
  retenu sur l'article si la personne a le droit de gérer les articles.

## Ce que fait la plateforme
- Le stock reste compté **en unités** : historiques, alertes et valeur du stock ne changent pas.
- Casiers saisis pour un article sans casier et sans `par_casier` : refusé, avec un message clair.

Fonctions : `regler_lot_article`, `saisir_stock` (`supabase/migrations/20261010000126_stock_casiers.sql`).
