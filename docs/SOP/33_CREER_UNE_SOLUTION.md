# SOP 33 · Créer une Solution et y ajouter des modules

Une Solution (Commerce, Restaurant, Hôtel, RH, Gestion scolaire…) est une **configuration** :
un nom, un statut et une liste de modules proposés. La créer ne crée **aucun code** ni aucun écran.

## Créer
- **Écran** : Agence Elite → Catalogue → Solutions → « Nouvelle solution » (Super Admin).
  Identifiant technique en minuscules (`scolaire`), jamais modifié ensuite.
- **Ou migration** : `select public.enregistrer_solution('{"id":"scolaire","nom":"Gestion scolaire"}')`
  n'est appelable que par un Super Admin ; dans une migration, faites un `insert into public.solutions`
  puis `insert into public.solution_modules` du socle (`etablissement`, `membres`, `tableau_de_bord`, `par_defaut = true`).
- Le socle est ajouté automatiquement. Statut de départ : **Prévue** (`future`).

## Ajouter un module à une Solution
- Écran : fiche de la solution → cases « Modules proposés », ou fiche du module → « Proposé par les solutions ».
- RPC : `definir_proposition_module(solution, module, true, par_defaut)`.
- Réutiliser les modules communs (articles, stock, caisse, ventes, paiements, contacts, dépenses).
- Retirer un module utilisé par une offre ou un établissement est refusé par la base.

## Mettre en service
La base refuse « En service » (`active`) tant qu'aucun module métier n'est **Disponible** ou **Bêta**.
Ensuite : créer l'offre (SOP 38), puis un établissement pilote (SOP 19).
