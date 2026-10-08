# Tâche 010 — Modules complémentaires par licence + réconciliation de catalogue

**Contexte** : The Dream est en solution `commerce` (immuable) et a besoin de Salle et Cuisine ; son catalogue préparé
(218 articles) doit être rapproché de ses 114 articles saisis à la main.

**Fait** (Claude, 2026-10-08, sur mandat de Juste) :
- Migration `20261008000001_modules_complementaires` : `options_modules` (tarifs, RLS, audit), `accorder_module` étendu
  (module d'une autre solution, motif obligatoire, dépendances ajoutées, montant tracé), `verifier_module_propose` et
  `synchroniser_modules_licence` couvrent les modules accordés en complément, `modules_complementaires_etablissement`,
  `editeur_etablissement` enrichi, `enregistrer_option_module`.
- Écrans : fiche établissement › Modules › « Modules complémentaires » (motif, historique) ; Offres et prix › « Options de modules ».
- Pilote : volet Restaurant sur l'établissement fictif B (modules complémentaires, table, affectation, commande,
  cuisine/bar, transfert motivé, encaissement, statistiques, refus, isolation) ; comptes `serveur-b`, `cuisine-b`.
- Workflow « Réconcilier un catalogue » (lecture seule) + `scripts/reconcilier_catalogue*.sql` ; SOP 24 et 59.
- Tests : `tests/modules_complementaires.test.js`, `tests/reconcilier_catalogue.test.js`.

**Reste (décision de Juste)** : accorder Salle / Cuisine à The Dream ; lancer la réconciliation puis relire le rapport.
