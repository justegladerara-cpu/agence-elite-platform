# SOP 16 · Revenir en arrière

| Problème | Action |
|---|---|
| Le site affiche une mauvaise version | Cloudflare → projet `agence-elite-platform` → Deployments → version précédente → **Rollback** |
| Le code poussé est mauvais | `git revert <commit>` puis push sur `main` (jamais de réécriture d'historique) |
| Une migration pose problème | **Nouvelle** migration correctrice ; ne jamais supprimer ni éditer la migration appliquée |
| Des données sont abîmées | Restaurer la dernière sauvegarde sur un projet **neuf**, comparer, rapatrier après accord |

Attention : revenir à un ancien site après une migration est sans risque tant que les anciennes
fonctions existent encore (les migrations ajoutent, elles ne retirent pas).
