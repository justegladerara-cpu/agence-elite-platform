# Catalogue The Dream Lounge Bar Restaurant

Source : transcription fournie directement par le propriétaire le 2026-10-03. Les photographies ne sont pas nécessaires et aucune ligne barrée n'est incluse.

## Contrôles

- 225 lignes tarifaires ; 221 vendables et 4 en attente ; 39 catégories.
- 18 lignes portent un libellé neutre `Tarif 1` / `Tarif 2`, soit deux tarifs pour 9 vins sans inventer « verre » ou « bouteille ».
- Sodabi, Vin de palme spécial Sud et Tcham spécial Nord sont inactifs et sans prix.
- Frites de pomme de terre est inactive et sans prix : les tarifs contradictoires 1 000 / 1 500 XAF sont conservés dans `motif_attente`.
- Tous les articles ont `suivi_stock=non` et aucun stock initial : aucune recette ou consommation matière n'est inventée.
- Les deux Mojito, les deux Tequila et les poissons proposés selon des préparations différentes restent des offres distinctes grâce à leur catégorie et leur référence stable.

## Application protégée

1. Déployer d'abord la migration `20261003000017_import_catalogue_restaurant.sql` selon la SOP 12.
2. Se connecter comme responsable autorisé de **The Dream Lounge Bar Restaurant**.
3. Vérifier dans le sélecteur le nom de l'établissement et son Hub, puis ouvrir **Articles → Importer**.
4. Charger `catalogue.csv` et contrôler le dry-run : 221 créations si le catalogue est vide, 4 attentes, 18 variantes tarifaires. Un résultat différent doit être analysé avant confirmation.
5. Confirmer l'import, puis contrôler Salle → nouvelle commande, Cuisine et Caisse.

Ne jamais charger ce fichier depuis Patrondemo ou un autre établissement. L'import n'est pas appliqué automatiquement par une migration : l'identité de l'établissement doit être vérifiée dans la session protégée.
