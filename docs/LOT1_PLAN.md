# Plan d'exécution du Lot 1 : le socle

Objectif : un socle sûr et testé, avec clients, établissements, solutions, modules, membres et permissions. **Aucun module métier.**

| N° | Tâche | Contenu | Dépend de |
|---|---|---|---|
| 001 | Fondations et modèle de données | outillage de test (vitest + PGlite + shim Supabase), migrations du modèle, catalogue de départ, tests de structure, CI | — |
| 002 | Fonctions d'accès et RLS | `est_super_admin`, `est_membre`, `est_dirigeant`, `module_actif`, `a_permission` ; politiques RLS sur toutes les tables ; gardes (`etablissement_id` verrouillé, dépendances de modules, établissement suspendu = pas d'écriture) | 001 |
| 003 | Tests d'isolation et audit | matrice rôles × tables × opérations (A ne voit jamais B, `anon` rien, dirigeant en lecture, module désactivé) ; triggers d'audit ; sessions du mode support | 002 |
| 004 | Administration éditeur (base) | fonctions : créer un client, créer un établissement avec ses modules par défaut, activer ou désactiver un module, inviter un gérant, accepter une invitation, suspendre ou archiver | 003 |
| 005 | Application : noyau | Vite + React, auth Supabase locale, contexte et sélecteur d'établissement, garde de permissions, registre des modules, tests unitaires | 004 |
| 006 | Interfaces du socle | écrans éditeur (clients, établissements, modules) et établissement (identité, paramètres, membres et rôles), démo fictive, tests de bout en bout | 005 |
| 007 | Reconstruction et clôture | CI avec la CLI Supabase (reconstruction depuis zéro), documentation finale, bilan du Lot 1 | 006 |

Règle : une tâche n'est terminée qu'après l'audit de Claude (relecture du diff et tests relancés).
