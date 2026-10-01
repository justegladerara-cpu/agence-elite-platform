# Journal de Claude (manager / architecte)

## 2026-10-01 — Démarrage du Lot 1
- Dépôt initialisé avec la documentation de référence (architecture validée, glossaire, modèle de données, sécurité, décisions, plan du Lot 1) et les règles `AGENTS.md`.
- Choix de test : PGlite et un shim Supabase. J'ai vérifié que PGlite gère les rôles, la RLS, `SET LOCAL ROLE` et les claims JWT via `set_config`, ce qui permet de tester sans Docker.
- Tâche 001 confiée à Codex : fondations et modèle de données.
- Contraintes rappelées : pas de CRM, pas de production Kangourou, pas d'Elite Hôtel, pas de Supabase distant, pas de module métier.
