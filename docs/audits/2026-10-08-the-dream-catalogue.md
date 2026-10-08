# Audit initial — rapprochement du catalogue The Dream (2026-10-08)

Statut : **audit du CSV et premier rapprochement avec la production exécutés en lecture seule ; aucune mutation des articles**.

## Sources contrôlées
- `donnees/imports/the-dream/catalogue.csv` et `README.md`
- `docs/SOP/59_IMPORTER_LE_CATALOGUE_D_UN_CLIENT.md`
- `tests/import_catalogue_restaurant.test.js`
- Schéma Supabase public (lecture seule) : `articles`, `categories_articles`, `lignes_vente`, `mouvements_stock`, `etablissement_modules`.

## Constats vérifiés
- 228 lignes de données, dont **218 actives et 10 en attente**.
- Aucune ligne active sans prix.
- Aucune référence dupliquée parmi les lignes actives.
- Le CSV seul ne permet **pas** de conclure que deux articles existants et importés sont identiques.
- Les identifiants UUID `articles.id` sont référencés par `lignes_vente.article_id` et `mouvements_stock.article_id`. Il est impératif de préserver les identifiants et l'historique.
- La procédure d'import actuelle privilégie les références ; une simple simulation du CSV brut n'est **pas** une déduplication sémantique.
- La solution commerciale de The Dream est `commerce` (contrôle Supabase en lecture seule).

## Les 10 entrées bloquées
1. Camino Real Tequila Blanco — prix contradictoire.
2. J&B Rare — prix absent.
3. Sodabi — prix absent.
4. Vin de palme spécial Sud — prix absent.
5. Tcham spécial Nord — prix absent.
6. Mwambé mokalu — prix partiellement masqué.
7. Ngulu à la braise — prix incertain.
8. Bouillon de ngulu — prix incertain.
9. Frites de pomme de terre — prix contradictoire.
10. Chikwangue (mayaka) — nom raturé.

## Suite nécessaire pour un rapprochement fiable
1. Obtenir une extraction **en lecture seule** des articles de The Dream, avec `id`, `reference`, `nom`, `variante`, `prix_vente`, `unite`, `categorie_id`, `actif` et les liens aux ventes/stock.
2. Comparer nom normalisé, catégorie, variante, conditionnement, prix, référence et usage historique.
3. Classer : certain / probable / conflit / nouveau / historique uniquement.
4. Générer une table de correspondance CSV/JSON, une proposition de catalogue final et un dry-run.
5. **Aucun import ni modification des articles réels sans validation explicite de Juste.**

## Modules et impression
- `docs/SOP/24_ACCORDER_UN_MODULE.md` décrit l'octroi de modules additionnels ; réutiliser ce système, sans modifier les droits commerciaux de The Dream.
- `src/modules/restaurant/manifeste.js` expose `restaurant_salle` et `restaurant_cuisine`.
- `src/modules/recus/Recu.jsx` fournit un ticket fixe 80 mm ; un futur Print Studio devra conserver les mentions obligatoires et prévoir des profils d'imprimante 58/80 mm, CSS et ESC/POS.
- Priorité ERP : rapprochement The Dream → modules à la carte → Print Studio → Property / Fleet → Studio / Apps.

## Limites
La lecture SQL détaillée des articles a été refusée par les contrôles de sécurité du connecteur dans cette session. Les chiffres du rapport antérieur (114 articles, 57 ventes) restent à reconfirmer par une extraction autorisée. **Aucun chiffre de fusion finale n'est inventé.**

## Résultats du premier rapprochement réel (2026-10-08)
- Extraction Supabase en lecture seule : **114 articles** pour The Dream.
- Comparaison des 218 lignes actives avec normalisation des noms, variantes et prix : **17 concordances exactes**, **14 noms concordants avec divergence de prix**, **187 lignes sans concordance exacte de nom**.
- Les 187 lignes ne sont **pas** considérées automatiquement comme nouvelles : rechercher synonymes, différences de conditionnement et variantes.
- Exemples de divergences de prix : Cointreau 30 000 → 20 000 ; Baileys 30 000 → 25 000 ; Saint James Rhum Blanc 20 000 → 40 000 ; Poulet dur braisé 8 000 → 4 500 ; Brochettes de poulet 2 000 → 3 500 FCFA.
- Moteur `src/modules/articles/rapprocherCatalogue.js` ajouté : aucune écriture, aucun rattachement de plusieurs lignes à un même UUID, blocage des prix et variantes divergents ; tests dédiés.
- **Ce premier rapprochement n'est pas une proposition de fusion approuvée**. L'import production attend la résolution des conflits et une validation métier des prix.
