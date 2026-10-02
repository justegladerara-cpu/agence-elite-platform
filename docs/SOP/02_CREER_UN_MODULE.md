# SOP 02 · Créer un nouveau module

Un module = une entrée du catalogue `modules` (base) + un **manifeste** côté écran
(`src/modules/<dossier>/manifeste.js`). Une solution (Commerce, Hôtel…) est une **configuration**
de modules, jamais une application séparée.

**Avant de créer :** regardez le catalogue (Agence Elite → Catalogue). Le module existe peut-être
déjà en « Prévu » (ex. `achats`, `hotel_chambres`) : on le **programme**, on n'en crée pas un second.
Une donnée commune (contacts, articles, ventes, stock, paiements) se **réutilise** : jamais de
`restaurant_contacts` ni de `hotel_articles`.

1. Migration (SOP 03) : `insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre)`
   avec `statut = 'en_preparation'` (« En développement »). Si le module existe en `futur`, `update` son statut.
   - `nature` : `metier` (propre à une activité), `transversal` (utile à plusieurs), `socle` (réservé au noyau).
   - `categorie` : une ligne de `categories_modules` (SOP 41).
2. Dépendances (SOP 34) dans `module_dependances` ; la base refuse les boucles.
3. Proposition par les solutions (SOP 33) dans `solution_modules`.
4. Permissions (SOP 04) `<module>.lire`, `<module>.gerer`… et rôles. **Sans permission déclarée, la base
   refuse de passer le module en « Disponible » ou « Bêta ».**
5. Tables métier : `etablissement_id` obligatoire, `hub_id` si la donnée dépend d'un lieu, RLS,
   lecture via `a_acces(etablissement_id)` ; écritures par RPC (`exiger_permission` + `exiger_module_actif`).
6. Réglages éventuels (SOP 35), capacités Hub (SOP 40).
7. Écran : dossier `src/modules/<module>/`, manifeste (pages SOP 06, widgets SOP 37) copié de
   [`templates/TEMPLATE_MANIFESTE.js`](templates/TEMPLATE_MANIFESTE.js), ajouté à `MANIFESTES` dans `src/modules/index.js`.
8. Tests : isolation entre deux établissements, refus sans permission, refus sans module accordé.
   `tests/registre.test.jsx` vérifie qu'aucune page ne pointe vers une permission inexistante.
9. Cycle de vie (SOP 42) : `en_preparation` → `beta` (clients pilotes) → `actif` (« Disponible »),
   seulement une fois testé et documenté.

Modèles : [`TEMPLATE_MIGRATION.sql`](templates/TEMPLATE_MIGRATION.sql), [`TEMPLATE_MANIFESTE.js`](templates/TEMPLATE_MANIFESTE.js), [`TEMPLATE_PAGE.jsx`](templates/TEMPLATE_PAGE.jsx).
