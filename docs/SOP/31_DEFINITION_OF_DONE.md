# SOP 31 · Definition of Done

Une tâche est finie quand **tout** est vrai :

- [ ] Le besoin est couvert du point de vue de l'utilisateur (avant / après écrit).
- [ ] Règles appliquées **dans la base** (RPC + RLS), pas seulement à l'écran.
- [ ] Aucune migration appliquée n'a été modifiée ; les nouvelles sont idempotentes et non destructives.
- [ ] Aucune suppression de données financières ou de stock.
- [ ] `npm test` vert, `npm run build` vert, CI verte sur le commit.
- [ ] Aucun test ignoré à cause d'un échec de préparation ; les E2E navigateur sont bloquants.
- [ ] Ressource limitée : test de concurrence sur un Supabase réel (stock, disponibilité, solde ou numérotation).
- [ ] Tests : cas autorisé, cas refusé, isolation, Hub si concerné.
- [ ] Écran : design system, mobile vérifié, mono-Hub sans notion de Hub.
- [ ] Aucun secret, aucune donnée réelle dans le diff, les journaux ou les captures.
- [ ] Production : base puis site ([SOP 12](12_DEPLOYER_EN_PRODUCTION.md)), puis tests en ligne ([SOP 14](14_SMOKE_TESTS_PRODUCTION.md)).
- [ ] Documentation : DECISIONS, SOP et PROJECT_STATE à jour.
