Le test d'import chargeait le vrai catalogue d'un client, contrairement au mandat et aux règles permanentes. Il utilise désormais un CSV inventé : variantes à prix distincts, caractères CSV, lignes sans prix, 218 créations et 10 attentes, 29 catégories, aucun stock. Dry-run, idempotence et isolation restent contrôlés. Aucun fichier du client ni donnée de production modifié.

Un garde automatique interdit les références aux fichiers d'import client dans les sources des tests et de la démo. La SOP59 distingue la revue humaine du fichier réel des tests de format/import fictifs.

## Rendu
- Avant : garde fictif en échec (référence au fichier client).
- Après : 3/3 ciblés, suite complète479/479 (50 fichiers), build réussi.
- Sans migration ; CI/PR non vérifiables dans ce cloud (API GitHub Forbidden).


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
