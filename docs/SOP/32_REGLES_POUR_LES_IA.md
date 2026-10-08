# SOP 32 · Règles pour les IA (Claude, GPT, Codex…)

**Lire d'abord :** `CLAUDE.md`, `docs/HANDOFF_CLAUDE_CODE.md`, `docs/DEPLOIEMENT.md`, `docs/PROJECT_STATE.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, puis la SOP de la tâche.

**Ne jamais :**
- reconstruire le projet, créer un autre projet Supabase ou Cloudflare, réinitialiser la base ;
- modifier une migration déjà appliquée ; supprimer des données ; désactiver RLS ou une vérification ;
- écrire un secret ou un mot de passe en clair (code, commit, journal, doc) ;
- utiliser une vraie donnée client (Kangourou ou autre) dans les tests ou la démo ;
- toucher au CRM Agence Elite ou à un autre produit ; relancer Hôtel/Restaurant sans demande ;
- réécrire l'historique git (`push --force`, `rebase` sur `main`).

**Toujours :**
- travailler par petites étapes testées ; base d'abord, écran ensuite ;
- appliquer la [Definition of Done](31_DEFINITION_OF_DONE.md) ;
- choisir l'option sûre et réversible en cas de doute, et l'écrire dans DECISIONS ;
- expliquer le résultat en français simple, sans jargon.

Mission type : [`templates/TEMPLATE_MISSION.md`](templates/TEMPLATE_MISSION.md).
