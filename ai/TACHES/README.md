# Tâches

Protocole :
1. Claude écrit `ai/TACHES/NNN-titre.md`.
2. Claude ouvre une PR brouillon `codex/tache-NNN-…` vers `main` et la confie à Codex avec un commentaire `@codex`.
3. Codex implémente dans la PR, puis rend son travail (section **Rendu**).
4. Claude audite : relecture du diff, `npm test` relancé, vérification des critères.
5. Si c'est bon, Claude valide et la PR est fusionnée. Sinon, Claude écrit une tâche corrective `NNN-b`.
6. Ensuite seulement, on passe à la tâche suivante.

Chaque tâche contient, dans cet ordre : Contexte, Objectif, Fichiers concernés, Contraintes, Travail demandé, Tests obligatoires, Critères d'acceptation, Ce qu'il ne doit pas faire, Rendu.

| N° | Tâche | État |
|---|---|---|
| 001 | Fondations et modèle de données | fait (audité, correctifs b454990) |
| 002 | Fonctions d’accès et RLS | fait |
| 003 | Tests d’isolation et audit | fait |
| 004 | Administration éditeur (base) | fait |
| 005 | Application : noyau | fait |
| 006 | Interfaces du socle | fait |
| 007 | Reconstruction et clôture | fait |
| C1 | Solution Commerce (base, RPC, écrans, mode local) | fait le 2026-10-02 par Claude, voir docs/COMMERCE.md |
| M1 | Audit offensif final | fait le 2026-10-02 (9 défauts corrigés) |
| M2-4 | Espace Agence Elite, équipe et invitations, licences, mise en service | fait le 2026-10-02 |
| M5 | Préparation production (docs/PRODUCTION.md, workflows) | fait ; mise en ligne en attente de Juste |
| M6 | Pilote fictif à deux établissements (tests/pilote.test.js) | fait |
| M7 | Processus client et guide (docs/PROCESSUS_CLIENT.md) | fait |

Depuis le 2026-10-02, Codex est en pause : Claude développe directement.
