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
