# agence-elite-platform

La plateforme des solutions métier éditées par **Agence Elite** (nom commercial à décider).

Un **socle unique** : Agence Elite (éditeur) → Clients → Établissements → Solution → Modules activés → Utilisateurs / rôles / permissions → Données de l'établissement.

- Ce dépôt est **séparé** du CRM interne d'Agence Elite (`agence-elite-crm`).
- Il ne contient aucun code du Kangourou ni d'Elite Hôtel (archivé).
- État : socle terminé ; **Solution Commerce** utilisable (voir `docs/COMMERCE.md`).

## Essayer
```
npm install
npm run dev
```
L'application démarre en mode local avec une démo fictive ; choisissez un profil (gérante, caissier, comptable).

## À lire en premier
1. `docs/ARCHITECTURE.md` : le socle validé
2. `docs/GLOSSAIRE.md` : client, établissement, solution, module, utilisateur, contact
3. `docs/MODELE_DONNEES.md` : tables, relations, contraintes
4. `docs/SECURITE.md` : règles d'accès
5. `docs/LOT1_PLAN.md` : le plan d'exécution
6. `docs/COMMERCE.md` : la Solution Commerce
7. `AGENTS.md` : règles de travail des agents (Codex)

## Organisation du travail
Depuis le 2026-10-02, Claude développe directement sur `main` (Codex en pause). Journal : `ai/CLAUDE/JOURNAL.md`.
