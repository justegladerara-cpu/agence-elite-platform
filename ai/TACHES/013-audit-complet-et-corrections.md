# Tâche 013 — Audit complet et correction des erreurs

## Contexte et mandat
Juste autorise le 2026-10-08 la mission complète dans le chat cloud : audit avant correction, tests, code, branches Codex par thème, PR et CI, puis production dans les accès effectifs. Le mandat remplace le seul onboarding.

## Périmètre
A : trois suites initiales, builds, parcours, instabilité Restaurant, chargement dynamique et console.
B : sécurité du catalogue SQL après toutes migrations, contrats et isolation, advisors/migrations production en lecture seule.
C : pages/profils/largeurs 1360/820/390, RPC et paramètres, lectures/tri, impression.
D : workflows site/pilote main, Cloudflare, versions officielles Actions.
E : ESLint 10 minimal (hooks, variables inutilisées), lint CI et corrections prouvées.

## Contraintes
Base d'abord ; écriture production uniquement par workflows protégés : sauvegarde réussie, simulation sur branche avec liste exacte, appliquer avec JE CONFIRME, vérification, puis fusion du code dépendant. Migrations nouvelles réservées 20261012000001–20261012000099. Ne jamais modifier une migration fusionnée ou appliquée.

PR #11 et #9 appartiennent à d'autres sessions : aucun push/fusion ; immobilier appliqué ne doit pas être réappliqué. PR #7 : proposer fermeture seulement. Aucun changement de données The Dream/Hôtel 2i/Creo, de prix/stock réels, d'activation Salle/Cuisine, de DNS/Cloudflare/secrets ou du CRM. Aucune donnée réelle dans tests/démo ; aucun secret ; aucun force push, rebase main, test désactivé ou affaibli.

## Rendu
Chaque anomalie est inscrite avant correction dans docs/AUDIT_2026-10.md, avec cause et preuve avant/après. Rapport final par PR : CODE PRÊT, CODE PUSHÉ, CI VERTE, BASE MIGRÉE/sans migration, MERGÉ, FRONTEND DÉPLOYÉ, PRODUCTION VÉRIFIÉE. Mettre à jour PROJECT_STATE, DECISIONS et le journal Codex. Les accès externes absents sont des blocages, jamais des résultats supposés.


## État de livraison

Local : audit consigné avant corrections,14 anomalies corrigées avec preuves ;7 branches de correction poussées et une branche documentaire. Combinaison locale509/509 tests, lint zéro, deux builds et seuil500kB. Matrice1634 relevés métier +42éditeur aux 3 largeurs ; pas d’exhaustivité revendiquée sur chaque action de sous-page. Rendu quittance PR #11 hors dépôt/fictif seulement, pas de migration/RPC réelle.

Externe : PR non créées (GraphQL Forbidden), listePR/CI/logs inaccessible ; Supabase lecture non exposé ; registre Docker inaccessible. Aucune migration/fusion/publication/production vérifiée. Voir docs/AUDIT_2026-10.md et AUDIT_2026-10_PREUVES.md, descriptions conservées dans docs/AUDIT_2026-10_PR/.

## Critères restant à satisfaire

1. Accès GitHub/Supabase lecture effectifs, PRouvertes/CI/advisors/migrations et logsWorkers relus.
2. PR par thème et CI tests/reconstruction vertes ; résoudre les conflits d’intégration signalés sans affaiblir les tests.
3. Séquence base protégée EXACTE des deux migrations, vérification avant fusion dépendante ; jamais immobilier.
4. Après chaque fusion : Pages, Adresse du site et pilote officiel, liens/résultats exacts dans le rapport.
5. Revue complémentaire des actions/champs/sous-routes non sondés, module immobilier complet seulement après intégration par son propriétaire.

## Ce qui reste interdit

Données réelles/CRM, prix/stock/activation clients, branches PR #9/11, fermeture PR #7, secrets/DNS/réglages Cloudflare sans les accords spécifiques du mandat. Aucun contournement d’accès production.
