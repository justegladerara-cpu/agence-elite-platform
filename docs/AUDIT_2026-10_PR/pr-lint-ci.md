Aucun lint ne vérifiait les hooks ou les variables inutilisées. ESLint 10.12.0 et react-hooks 7.1.1 ajoutent ces contrôles à la CI, sans règle de style. Les imports React inutiles avec JSX automatique, un paramètre et deux variables inutilisées sont retirés ; les extractions qui excluent volontairement une propriété sont conservées. Vitest utilise explicitement le même runtime JSX automatique que Vite (sa configuration séparée utilisait le runtime classique). Aucune assertion de test modifiée.

Tous les workflows utilisent checkout v7.0.1 et setup-node v7.1.0, versions stables vérifiées dans les dépôts officiels https://github.com/actions/checkout et https://github.com/actions/setup-node. Node 24 correspond au runtime requis et testé ici ; les runners GitHub hébergés sont compatibles.

## Rendu
- Avant : 76 no-unused-vars, 5 directives obsolètes, aucun hook conditionnel identifié.
- Après : npm run lint sans erreur ; 478/478 tests, builds standard et démo réussis.
- Sans migration. Exécution CI/production non vérifiée : API GitHub Forbidden.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
