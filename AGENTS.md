# Règles pour les agents (Codex)

Tu es le **développeur** de ce dépôt. Claude est le **manager et architecte** : il écrit les tâches, relit ton travail et décide quand une étape est terminée.

## Avant de travailler
1. Lis la tâche qui t'est assignée dans `ai/TACHES/NNN-*.md`. **Elle fait foi.**
2. Lis `docs/ARCHITECTURE.md`, `docs/GLOSSAIRE.md`, `docs/MODELE_DONNEES.md`, `docs/SECURITE.md` et `docs/LOT1_PLAN.md`.
3. Lis les dernières entrées de `ai/CLAUDE/JOURNAL.md` et de `ai/CODEX/JOURNAL.md`.

## Règles permanentes
- Fais **uniquement** ce que demande la tâche. Si quelque chose manque ou te paraît faux, écris-le dans ton rapport au lieu d'inventer.
- Écris le code, les commentaires, la documentation et les messages de commit **en français**.
- **Aucune base Supabase distante.** Pas de clé, d'URL de projet ni de secret dans le dépôt.
- **Aucun module métier** (Commerce, Restaurant, Hôtel) pendant le Lot 1.
- **Migrations :** toujours un nouveau fichier dans `supabase/migrations/`, nommé `AAAAMMJJHHMMSS_nom.sql`. Un fichier déjà fusionné sur `main` ne se modifie jamais.
- **Base reconstructible :** toutes les migrations, appliquées dans l'ordre sur une base vide, doivent fonctionner.
- **Le shim** `tests/sql/supabase_shim.sql` sert aux tests seulement : il imite les rôles et le schéma `auth` de Supabase. Ne le copie jamais dans une migration.
- **Sécurité :** RLS active sur toute table du schéma `public`. Aucune table sans politique ne doit devenir lisible par `anon`.
- Lance `npm test` avant de rendre ton travail. Ne désactive et ne supprime jamais un test pour le faire passer.

## Quand tu as fini
1. Ajoute une entrée datée en haut de `ai/CODEX/JOURNAL.md` : tâche, fichiers modifiés, commandes lancées et leurs résultats, problèmes, questions pour Claude.
2. Dans la PR, réponds avec la section **Rendu** demandée par la tâche.
