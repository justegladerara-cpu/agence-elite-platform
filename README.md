# agence-elite-platform

La plateforme des solutions métier éditées par **Agence Elite** (nom commercial à décider).

Un **socle unique** : Agence Elite (éditeur) → Clients → Établissements → Solution → Modules activés → Utilisateurs / rôles / permissions → Données de l'établissement.

- Ce dépôt est **séparé** du CRM interne d'Agence Elite (`agence-elite-crm`).
- Il ne contient aucun code du Kangourou ni d'Elite Hôtel (archivé).
- État : socle terminé ; **Solution Commerce** utilisable ; espace Agence Elite (clients, licences, équipe, mise en service) prêt ; mise en ligne préparée (voir `docs/PRODUCTION.md`).

## Essayer
```
npm install
npm run dev
```
L'application démarre en mode local avec une démo fictive ; choisissez un profil (Agence Elite, gérante, caissier, comptable) ou entrez une adresse e-mail.

## À lire en premier
0. `CLAUDE.md` puis `docs/HANDOFF_CLAUDE_CODE.md` : passation complète pour une session Claude Code (mode de travail, accès, déploiement, état exact) ; `docs/DEPLOIEMENT.md` : mise en ligne pas à pas
1. `docs/ARCHITECTURE.md` : le socle validé
2. `docs/GLOSSAIRE.md` : client, établissement, solution, module, utilisateur, contact
3. `docs/MODELE_DONNEES.md` : tables, relations, contraintes
4. `docs/SECURITE.md` : règles d'accès
5. `docs/LOT1_PLAN.md` : le plan d'exécution
6. `docs/COMMERCE.md` : la Solution Commerce
7. `docs/PROCESSUS_CLIENT.md` : de l'offre à la mise en service d'un client
8. `docs/PRODUCTION.md` : mise en ligne, sauvegardes, retour arrière
9. `AGENTS.md` : règles de travail des agents (Codex)

## Organisation du travail
Depuis le 2026-10-02, Claude développe directement sur `main` (Codex en pause). Journal : `ai/CLAUDE/JOURNAL.md`.
