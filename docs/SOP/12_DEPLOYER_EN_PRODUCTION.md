# SOP 12 · Mettre en production

Ordre : **base d'abord, site ensuite** (le nouvel écran appelle les nouvelles fonctions).

1. CI verte sur le commit (`ci.yml` : tests, build, Supabase neuf, démo ×2, pilote, comptes, sauvegarde/restauration).
2. Sauvegarde manuelle : Actions → **Sauvegarde de la base** → Run workflow ([SOP 13](13_SAUVEGARDER_ET_RESTAURER.md)).
3. Noter les totaux avant (ventes, paiements, mouvements, stock total, clôtures) avec une requête de lecture.
4. Actions → **Déploiement de la base** → mode `simulation` : lire la liste des migrations.
5. Si la liste est celle attendue : mode `appliquer`, confirmation `JE CONFIRME`.
6. Comparer les totaux après : ils doivent être identiques (une migration n'efface rien).
7. Push sur `main` du code de l'interface → Cloudflare reconstruit et publie.
8. [SOP 14](14_SMOKE_TESTS_PRODUCTION.md) : tests en ligne.
9. En cas de problème : [SOP 16](16_RETOUR_ARRIERE.md).

Détails techniques : [`docs/PRODUCTION.md`](../PRODUCTION.md).
