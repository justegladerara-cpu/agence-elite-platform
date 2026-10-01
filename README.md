# agence-elite-platform

La plateforme des solutions métier éditées par **Agence Elite** (nom commercial à décider).

Un **socle unique** : Agence Elite (éditeur) → Clients → Établissements → Solution → Modules activés → Utilisateurs / rôles / permissions → Données de l'établissement.

- Ce dépôt est **séparé** du CRM interne d'Agence Elite (`agence-elite-crm`).
- Il ne contient aucun code du Kangourou ni d'Elite Hôtel (archivé).
- État : **Lot 1 en cours**, le socle seul. Aucun module métier.

## À lire en premier
1. `docs/ARCHITECTURE.md` : le socle validé
2. `docs/GLOSSAIRE.md` : client, établissement, solution, module, utilisateur, contact
3. `docs/MODELE_DONNEES.md` : tables, relations, contraintes
4. `docs/SECURITE.md` : règles d'accès
5. `docs/LOT1_PLAN.md` : le plan d'exécution
6. `AGENTS.md` : règles de travail des agents (Codex)

## Organisation du travail
Claude (manager et architecte) planifie, puis écrit une tâche dans `ai/TACHES/`. Codex (développeur) l'implémente dans une PR. Claude audite, valide ou renvoie une correction. Les journaux sont dans `ai/CLAUDE/JOURNAL.md` et `ai/CODEX/JOURNAL.md`.
