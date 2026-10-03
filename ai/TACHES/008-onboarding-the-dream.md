# Tâche 008 — ONBOARDING CLIENT — THE DREAM LOUNGE BAR RESTAURANT

## Contexte
Le Lot 1 et les modules métier sont terminés. La plateforme en production comprend Articles, Hubs, Caisse, Ventes, Salle et Cuisine. Le propriétaire mandate Codex pour préparer l'onboarding réel de l'établissement existant « The Dream Lounge Bar Restaurant » et du compte `patrondream`, sans créer de client ni d'établissement.

## Objectif
Importer de manière sûre, réversible, idempotente et isolée le catalogue transmis par le propriétaire, rendre le menu exploitable en Restaurant/Caisse et laisser un import de catalogue générique réutilisable.

## Fichiers concernés
- Nouvelle migration incrémentale pour le dry-run et l'import sécurisé.
- `src/modules/articles/` pour l'aperçu/import générique strictement nécessaire.
- Jeu d'import versionné dans `donnees/imports/the-dream/`.
- Tests Restaurant, Articles, permissions, RLS, Hubs, doublons et import.
- `AGENTS.md`, `ai/TACHES/README.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`, `docs/HANDOFF.md`, `ai/CODEX/JOURNAL.md`.

## Contraintes
- Identifier réellement Client → Établissement → Hub et le compte avant toute écriture ; ne jamais se fier au seul identifiant.
- Ne jamais créer de client ou d'établissement, ni écrire dans Patrondemo ou un autre établissement.
- Écriture métier uniquement par RPC sécurisée, avec permission, RLS, audit et contrôle du Hub/établissement.
- Ne jamais inventer prix, format, recette, ingrédient, consommation matière ou stock initial.
- Article sans prix ou prix contradictoire : inactif/non vendable. Article barré/retiré : absent du jeu d'import.
- Intervention distante uniquement par sauvegarde, simulation, workflow protégé, contrôles avant/après et smoke tests selon les SOP 12 à 16.
- Ne pas modifier le CRM interne Agence Elite.

## Travail demandé
1. Auditer l'état du projet et corriger la gouvernance Lot 1 devenue historique.
2. Préparer le catalogue complet fourni, avec références stables, catégories ordonnées, descriptions et tarifs XAF.
3. Fournir un dry-run qui annonce créations, mises à jour, lignes ignorées et conflits avant validation.
4. Importer les produits simples ; conserver les deux tarifs des vins avec des libellés neutres, ou les laisser explicitement en attente si le moteur ne le permet pas sans invention.
5. Garder les boissons traditionnelles sans prix et les frites à prix contradictoire non vendables.
6. Ne réaliser que les évolutions Restaurant génériques indispensables au rendez-vous ; consigner le reste.
7. Vérifier Restaurant/Caisse, mobile, `patrondream`, et l'absence d'impact sur les autres établissements.

## Tests obligatoires
- Tests ciblés Restaurant et Articles ; dry-run puis import ; répétition idempotente ; doublons.
- Isolation établissement et Hub, permissions, RLS, audit.
- Absence de prix et de stock inventés ; articles inactifs non commandables.
- Prise de commande et caisse/vente.
- `npm test`, `npm run build`; E2E bloquant en CI, limitation Chromium locale documentée le cas échéant.

## Critères d'acceptation
- Catalogue exact, organisé et démontrable sans toucher un autre établissement.
- Rapport chiffré avant application et après application.
- Production déclarée « OUI » seulement après exécution réelle du workflow protégé et smoke tests.
- Documentation et handoff complets ; commit et PR en français.

## Ce qu'il ne doit pas faire
- Pas de nouveau client/établissement, pas de Patrondemo, pas de SQL métier direct en production.
- Pas de migration destructive, désactivation RLS, secret, recette ou stock fictif.
- Pas de refonte sans rapport avec le rendez-vous ni de modification du CRM Agence Elite.

## Rendu
Rapport en 22 points demandé par le propriétaire, récapitulatif THE DREAM, commandes et résultats, état exact production/CI, commit/PR et actions restantes pour Claude.
