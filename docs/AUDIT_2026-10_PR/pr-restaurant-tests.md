Le test Restaurant supposait que ORDER BY cree_le,id conserve l'ordre du JSON d'ajout. Des horodatages peuvent être égaux ; les UUID peuvent alors permuter bière et eau. Le premier contrôle échoue avant la modification de la quantité d'eau. Le scénario partagé poursuit avec un reste14500 mais un paiement mobile15000, puis une vente inexistante. Le refus financier de la base est correct.

Les lignes sont maintenant identifiées par article/UUID conservé, la ligne ajoutée par différence d'UUID, la vente par l'UUID retourné. Une fixture permanente d'horodatages égaux et UUID désordonnés reproduit l'ancien problème. Tous les 15 tests et contrôles métier sont conservés, avec une vérification supplémentaire du cas d'égalité.

## Rendu
- Avant :4 échecs/11 réussites, dont exactement les deux erreurs signalées.
- Après :15/15, suite complète478/478, build réussi.
- Sans migration et aucune donnée réelle ; historique du run distant non relu faute d'API GitHub.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
