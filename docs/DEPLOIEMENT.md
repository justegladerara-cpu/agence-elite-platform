# Déploiement : GitHub → CI → Cloudflare → Supabase → vérification → lien

Guide opérationnel pour une session Claude Code (ou un humain). Le détail technique de la production (restauration,
retour arrière, SMTP) est dans [`PRODUCTION.md`](PRODUCTION.md) ; le contexte dans
[`HANDOFF_CLAUDE_CODE.md`](HANDOFF_CLAUDE_CODE.md). Les noms entre « » sont des workflows de l'onglet **Actions**.

## Vue d'ensemble

```
git push (branche)  ──► CI (automatique) ──► Cloudflare Pages : préview https://<id>.agence-elite-saas.pages.dev
        │
        ├─ si migration : « Sauvegarde de la base » ─► « Déploiement de la base » simulation ─► appliquer + JE CONFIRME
        │
fusion sur main ───► CI (automatique) ──► Cloudflare : production
                                           ├─ Pages  : https://saas.agence-elite.fr  (+ agence-elite-saas.pages.dev)
                                           └─ Worker : https://agence-elite-platform.justegladerara.workers.dev
        └─► « Pilote en production » (site = adresse) ─► rapport à Juste avec le lien
```

| Étape | Automatique ? | Qui lance |
|---|---|---|
| CI | oui, à chaque push / PR | GitHub |
| Build et publication Cloudflare | oui, à chaque push (`main` = production, autre branche = préview Pages) | Cloudflare |
| Sauvegarde | oui chaque nuit ; **manuelle** avant une migration | la session (outil GitHub `actions_run_trigger`) ou Juste |
| Migration de la base | **manuelle** (simulation puis `appliquer` + `JE CONFIRME`) | la session sous mandat de Juste, ou Juste |
| Pilote en production | manuel | la session ou Juste |
| Domaine, DNS, Cloudflare, Supabase Auth, secrets | manuel | **Juste seulement** |

Lancer un workflow avec l'outil GitHub : `actions_run_trigger` méthode `run_workflow`, `workflow_id` = nom du fichier
(`deploiement-base.yml`…), `ref` = branche, `inputs` = `{ "mode": "simulation" }` par exemple. Suivre :
`actions_list` (`list_workflow_runs` sur ce fichier, puis `list_workflow_jobs`) et `get_job_logs` (`return_content`).
Avec un `gh` authentifié : `gh workflow run deploiement-base.yml --ref <branche> -f mode=simulation`,
`gh run watch`, `gh run view --log`.

## A. Demande « frontend seulement » (aucun fichier dans `supabase/migrations/`)

1. `git fetch origin && git checkout -b claude/<sujet> origin/main`.
2. Coder ; `npm test` ; `npm run build` ; si l'écran change : `npm run build:demo`, `npx vite preview --port 4173 &`,
   `CHROMIUM_PATH=<chrome> npm run test:e2e` (bureau, tablette, téléphone, console sans erreur).
3. Relire `git diff` (aucun secret, aucune donnée réelle) ; commit en français ; `git push -u origin claude/<sujet>`.
4. Ouvrir la PR vers `main`. Attendre la CI : jobs `tests` et `reconstruction-supabase` verts.
5. Lire le check « Cloudflare Pages » du commit → **lien de préview** (section C). L'envoyer à Juste si une
   validation visuelle est utile.
6. Fusionner la PR (sauf si Juste veut valider avant). → CI de `main` verte, checks « Cloudflare Pages » et
   « Workers Builds » `success` sur le commit de fusion. **FRONTEND DÉPLOYÉ.**
7. Vérifier en ligne : `curl -I https://saas.agence-elite.fr` si le réseau le permet, sinon « Pilote en production »
   avec `site=https://saas.agence-elite.fr`. **PRODUCTION VÉRIFIÉE.**
8. Docs (module, DECISIONS, PROJECT_STATE, journal) ; message final à Juste avec le lien.

Une préview utilise la **vraie base de production** (`.env.production`) : ne pas y faire de tests qui écrivent dans un
vrai établissement.

## B. Demande « frontend + base » (nouvelle migration)

Ordre recommandé (la base **avant** le site, car le nouvel écran appelle les nouvelles fonctions) :

1. Branche ; nouvelle migration `supabase/migrations/AAAAMMJJNNNNNN_sujet.sql` (SOP 03) : idempotente, non destructive,
   RLS + politiques, `revoke … from public, anon`, `notify pgrst, 'reload schema';` à la fin.
2. Tests base (autorisé, refusé, anonyme, autre établissement, Hub, concurrence si ressource limitée) + écran ;
   `npm test` ; `npm run build` ; E2E.
3. Diff, commit, push, PR. **CI verte** (le job `reconstruction-supabase` rejoue toutes les migrations sur un Supabase
   neuf : c'est la preuve que la migration passe sur une vraie base).
4. Préview Cloudflare (section C) : à ce stade elle appelle une base **sans** la migration → les nouvelles fonctions
   répondent « schema cache ». C'est normal ; ne pas la présenter comme fonctionnelle.
5. Noter les totaux avant (lecture seule) si la migration touche des données existantes.
6. « **Sauvegarde de la base** » (manuel, sur `main`) → attendre `success` (la restauration de contrôle aussi).
7. « **Déploiement de la base** » sur **la branche de la PR**, `mode=simulation` → le journal de l'étape « Migrations
   en attente » doit lister **exactement** les nouveaux fichiers. Autre chose → stop, comprendre.
8. Même workflow, même branche, `mode=appliquer`, `confirmation=JE CONFIRME` → journal : « Applying migration … »,
   « Finished supabase db push ». **BASE MIGRÉE.**
9. **Fusionner la PR tout de suite** (sinon la base est en avance sur `main`, et la prochaine migration écrite depuis
   `main` sera refusée par `supabase db push`). → CI `main` verte, checks Cloudflare `success`. **FRONTEND DÉPLOYÉ.**
10. « Déploiement de la base » sur `main`, `simulation` → « à jour ».
11. « **Pilote en production** », `site=https://saas.agence-elite.fr` → vert. Totaux après = totaux avant.
12. Si le module a une démo : « Démo et comptes ». **PRODUCTION VÉRIFIÉE.**
13. Docs + journal + message final à Juste avec le lien et l'état exact.

En cas de problème : SOP 15 (incident) et 16 (retour arrière : nouvelle migration correctrice, rollback Cloudflare par
Juste, restauration sur projet neuf).

## C. Obtenir le lien du déploiement

- Le lien est dans le **check « Cloudflare Pages »** du commit : outil GitHub `pull_request_read` (`get_check_runs`)
  puis `get_check_run` sur l'identifiant du check ; le résumé contient « Preview URL » et « Branch Preview URL ».
- Ou lancer « **Adresse du site** » sur la branche : son journal affiche tous les checks du dernier commit, leurs liens,
  les déploiements GitHub et le code HTTP du workers.dev. Sans aucun risque.
- Production (`main`) : https://saas.agence-elite.fr (Pages, domaine personnalisé) ; https://agence-elite-saas.pages.dev ;
  https://agence-elite-platform.justegladerara.workers.dev (Worker).
- Terminé = check `completed` + `success`.

## D. Diagnostiquer

| Symptôme | Où regarder | Cause fréquente |
|---|---|---|
| CI rouge, job `tests` | `get_job_logs` du job ; refaire `npm test` / `npm run build` / E2E en local | vrai bug ; snapshot d'écran ; erreur console dans le parcours |
| CI rouge, job `reconstruction-supabase` | journal du job | migration invalide sur un vrai Postgres / Supabase (ce que PGlite tolère) ; démo non idempotente |
| CI `cancelled` | — | deux CI concurrentes sur une PR : relancer |
| « Workers Builds » rouge sur une branche | — | non bloquant si « Cloudflare Pages » est vert |
| « Cloudflare Pages » rouge | lien « View logs » (Juste) ; refaire `npm run build` en local | build cassé, version de Node |
| Écran : « Could not find the function … in the schema cache » | « Déploiement de la base » `simulation` | migration non appliquée (frontend > base) |
| `supabase db push` : « Remote migration versions not found in local migrations directory » | `list_migrations` / simulation | la base a une migration absente de la branche (base > Git) : travailler depuis la branche qui la contient |
| « Base injoignable » dans un workflow | journal de `url_base.sh` | secret `SUPABASE_DB_URL` changé / mot de passe tourné : Juste met à jour le secret (SOP 17) |
| Pilote rouge | journal du job | régression réelle : ne pas relancer en boucle, reproduire avec la CI locale |
