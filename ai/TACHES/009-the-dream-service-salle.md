# Tâche 009 — THE DREAM EN SERVICE : CATALOGUE RELU, CATÉGORIES, SERVEURS

## Contexte
L'import préparé par la tâche 008 échoue en production (« Could not find the function public.importer_catalogue … in
the schema cache »). Le propriétaire fournit les 6 photos du menu et demande, en une mission, un catalogue exact, la
gestion des catégories, l'affectation des serveurs aux tables avec historique, les statistiques par serveur et une prise
de commande rapide sur téléphone et tablette. Mission confiée à Claude (développeur) le 2026-10-05.

## Objectif
Rendre la démonstration Menu → Catégories → Salle → Table → Serveur → Commande → Cuisine/Bar → Caisse → Vente →
Activité possible pour The Dream, avec des évolutions génériques réutilisables par tout restaurant client.

## Fichiers concernés
Migration `20261005000001_restaurant_service_categories.sql` ; `src/modules/restaurant/`, `src/modules/articles/`,
`src/modules/caisse/Caisse.jsx`, `src/styles.css` ; `donnees/imports/the-dream/` ; tests ; workflow et script de
vérification en lecture seule ; documentation et SOP.

## Contraintes
Identiques à la tâche 008 (aucun client/établissement créé, aucun SQL manuel en production, aucune donnée inventée,
aucun stock ni recette, lignes barrées exclues, prix incertains « à confirmer », The Dream jamais codé en dur, CRM
interne intouché).

## Travail demandé
1. Diagnostiquer l'erreur de production. 2. Relire les 6 photos et corriger le CSV. 3. Catégories administrables.
4. Serveur affecté à une table, historique, serveur sur la commande, transfert, à emporter. 5. Statistiques et
service en cours. 6. Disponibilité. 7. Tests base, écrans, navigateur. 8. Documentation, SOP, passation.

## Tests obligatoires
`npm test`, `npm run build`, parcours navigateur (général et Restaurant) ; isolation établissement/Hub, permissions,
anon, RPC directs, import (dry-run, idempotence, doublons, variantes, sans prix, exclusions, mauvais établissement).

## Critères d'acceptation
Tests verts ; catalogue conforme aux photos et documenté ; production déclarée « OUI » seulement après workflow protégé.

## Ce qu'il ne doit pas faire
Pas de colonne `serveur_id` permanente sur la table, pas de fausse table « À emporter », pas de suppression de
catégorie, pas d'import dans un autre établissement.

## Rendu
Rapport final (Git, base, tests, The Dream, catalogue, prix, catégories, serveurs, restaurant, sécurité, production,
à confirmer). État : livré dans Git ; production et import en attente des actions de `docs/HANDOFF.md`.
