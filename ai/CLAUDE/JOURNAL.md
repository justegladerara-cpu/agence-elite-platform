# Journal de Claude (manager / architecte)

## 2026-10-02 — Solution Commerce développée directement (Codex en pause)
- b454990 : correctifs de sécurité du socle (invitation sans email, client suspendu, portée `clients_lecture`, sessions support, membres).
- 3133b71 : base Commerce (9 modules, 21 permissions, 10 tables, 19 RPC, immuabilité, audit, tableau de bord) et 21 tests de parcours et d'isolation.
- 956deee : moteur local PGlite dans le navigateur et démo fictive.
- 6298d08 : écrans (caisse, ventes, reçus, articles, stock, Z, contacts, dépenses, tableau de bord, paramètres).
- Vérifié : `npm test` 81/81, `npm run build`, parcours complet dans Chromium (article → vente → reçu → annulation → stock rétabli → Z → dépense → tableau de bord, mobile compris), aucune erreur console.
- Bug trouvé au parcours : ouvrir un formulaire avant la fin du chargement plantait l'écran. Corrigé, et chaque écran a désormais une garde d'erreur.
- Reste : aperçu en ligne et Supabase hébergé (décision et action de Juste).

## 2026-10-02 — Audit du Lot 1 rendu par Codex (commit 3d453b2)
- `npm ci`, `npm test` (43/43), `npm run build` : OK. CI verte, y compris la reconstruction avec la CLI Supabase.
- Tests ciblés écrits par Claude : 3 défauts confirmés.
  - Un compte sans email peut accepter n'importe quelle invitation.
  - Un client suspendu reste modifiable.
  - `clients_lecture` : bug de portée, un membre ne voit pas son client.
- Autres écarts relevés :
  - l'acteur des événements peut être usurpé ;
  - il manque l'ouverture et la fermeture des sessions support ;
  - le super admin lit des données hors du mode support ;
  - un gérant peut ajouter un membre sans invitation ;
  - `permissions_ajustees` n'est pas typé ;
  - le CSS est minifié ;
  - les tâches 002 à 007 sont dans un seul commit.
- Tâche corrective L1-C envoyée dans la PR n°1. Lot 1 non validé.

## 2026-10-01 — Démarrage du Lot 1
- Dépôt initialisé avec la documentation de référence (architecture validée, glossaire, modèle de données, sécurité, décisions, plan du Lot 1) et les règles `AGENTS.md`.
- Choix de test : PGlite et un shim Supabase. J'ai vérifié que PGlite gère les rôles, la RLS, `SET LOCAL ROLE` et les claims JWT via `set_config`, ce qui permet de tester sans Docker.
- Tâche 001 confiée à Codex : fondations et modèle de données.
- Contraintes rappelées : pas de CRM, pas de production Kangourou, pas d'Elite Hôtel, pas de Supabase distant, pas de module métier.
