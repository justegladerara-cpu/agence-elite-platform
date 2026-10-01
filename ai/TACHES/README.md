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
| 001 | Fondations et modèle de données | confiée à Codex (PR en cours) |
