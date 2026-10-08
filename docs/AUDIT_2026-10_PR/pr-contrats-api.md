Les lectures Restaurant, Hôtel et Fidélité demandaient plusieurs colonnes dans `ordre`, alors que les deux adaptateurs n'acceptent qu'une colonne et son sens. Le second champ était silencieusement ignoré. Les adaptateurs refusent désormais les formats invalides ; six lectures utilisent un tri valide et départagent les lignes côté affichage.

Les nouveaux tests analysent le code JSX et contrôlent les relations, les noms des RPC et leurs paramètres contre le catalogue après toutes les migrations, y compris les appels via `executer` et les cockpits dynamiques.

## Rendu
- Preuve avant : test tri, 7 échecs / 3 réussites.
- Après : tri et contrats 13/13 ; suite complète 491/491 (51 fichiers) ; build réussi.
- Sans migration ; aucune donnée de production modifiée.
- Pas de fusion tant que la CI tests/reconstruction et Cloudflare ne sont pas vérifiés.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Les mêmes contrôles de catalogue sont ajoutés à reconstruction-supabase après db reset, via un lecteur psql strictement local et en transaction read only. Gardes d’adresse testées ; exécution sur PostgreSQL réel non prouvée ici faute d’accès au registre Docker/CI.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
