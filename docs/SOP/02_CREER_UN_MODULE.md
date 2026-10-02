# SOP 02 · Créer un nouveau module

Un module = une entrée du catalogue `modules` (base) + une page déclarée dans
`src/modules/index.js`. Une solution (Commerce, Hôtel…) est une **configuration** de modules,
jamais une application séparée.

1. Migration : `insert into public.modules (id, nom, nature, statut, ...)` avec `statut = 'en_preparation'`
   tant que le module n'est pas prêt (statuts : `actif`, `en_preparation`, `futur`, `retire`).
2. Lier le module à la solution (`solution_modules`) : inclus d'office ou optionnel.
3. Déclarer ses permissions (`<module>.lire`, `<module>.gerer`…) et les rôles qui les ont.
4. Tables métier : `etablissement_id` obligatoire, `hub_id` si la donnée dépend d'un lieu,
   RLS activée, lecture via `a_acces(etablissement_id)` (et accès Hub si besoin).
5. Écritures par RPC qui appellent `exiger_permission` **et** `exiger_module_actif`.
6. Front : dossier `src/modules/<module>/`, entrée dans `PAGES` de `src/modules/index.js`
   avec `module`, `permission`, `groupe` (Pilotage, Vente, Catalogue et stock, Relations, Organisation).
7. Tests d'isolation entre deux établissements + refus sans permission + refus module non accordé.
8. Passer `statut = 'actif'` par une nouvelle migration ou depuis **Agence Elite → Modules**.

Modèle : [`templates/TEMPLATE_MIGRATION.sql`](templates/TEMPLATE_MIGRATION.sql), [`templates/TEMPLATE_PAGE.jsx`](templates/TEMPLATE_PAGE.jsx).
