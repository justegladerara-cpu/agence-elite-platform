# Prompt à copier-coller dans la nouvelle session Claude Code

Copier tout le bloc ci-dessous dans la nouvelle session (avec le dépôt `justegladerara-cpu/agence-elite-platform`
attaché ou cloné).

```text
Tu reprends le projet Agence Elite Platform (dépôt GitHub justegladerara-cpu/agence-elite-platform).
L'ancienne session Claude Code a laissé une passation complète dans le dépôt. Réponds-moi en français simple.

ÉTAPE 1 — LIRE, SANS RIEN MODIFIER
Lis dans cet ordre : CLAUDE.md, docs/HANDOFF_CLAUDE_CODE.md (en entier), docs/DEPLOIEMENT.md,
docs/PROJECT_STATE.md, docs/DECISIONS.md, AGENTS.md, docs/SOP/README.md, docs/SOP/31 et 32.
Pendant toute cette mission : ne modifie aucun fichier, ne fais aucun commit, aucun push, aucune PR,
aucun merge, ne lance aucun workflow qui écrit en base (Déploiement de la base en mode appliquer,
Démo et comptes, Pilote en production). N'écris dans aucune base. Ne révèle aucun secret.

ÉTAPE 2 — INSPECTER TON ENVIRONNEMENT
Vérifie concrètement et note le résultat de chaque commande :
1. Où est le dépôt, comment tu y accèdes (clone local ? outil d'attachement de dépôt ?).
2. git status ; git branch -a ; git log --oneline -15 ; git remote -v ; git fetch origin.
3. Lecture : arrives-tu à lire main et la branche de la PR #4 ?
4. Écriture : peux-tu pousser ? (teste avec `git push --dry-run origin HEAD:refs/heads/claude/test-acces`,
   sans pousser réellement).
5. GitHub CLI : `gh --version` et `gh auth status`.
6. Autres outils GitHub (serveur MCP GitHub ou autre) : peux-tu lister les PR, lire les checks d'un commit,
   lister les exécutions de workflows, lire les journaux d'un job, lancer un workflow, fusionner une PR ?
   Pour tester le lancement sans risque, tu as le droit de lancer UNIQUEMENT le workflow « Adresse du site »
   (adresse-site.yml, lecture seule) sur main, puis de lire son journal.
7. Cloudflare : peux-tu lire les checks « Cloudflare Pages » et « Workers Builds » du dernier commit de main ?
   Retrouves-tu le lien de préview de la PR #4 dans le check « Cloudflare Pages » ? As-tu un accès direct
   à Cloudflare (API, wrangler) ?
8. Supabase : as-tu la Supabase CLI ? un connecteur Supabase ? Si un connecteur existe, fais seulement
   une lecture : la liste des migrations du projet xrlfedosaqtffraadmgk, et compare-la à supabase/migrations/.
   N'utilise jamais un connecteur pour écrire ou appliquer une migration.
9. Réseau : `curl -sI https://saas.agence-elite.fr`, `curl -sI https://agence-elite-platform.justegladerara.workers.dev`,
   `curl -sI https://xrlfedosaqtffraadmgk.supabase.co` (bloqué ou non ?).
10. Outils locaux : node -v, npm ci, npm test (nombre de tests), npm run build, npx supabase --version,
    Chromium / Playwright disponible ? (essaie le parcours E2E décrit dans CLAUDE.md).
11. Variables d'environnement : liste seulement les NOMS utiles (jamais les valeurs).
12. Mémoire / instructions de projet : as-tu un mandat écrit de Juste pour travailler en autonomie ?

ÉTAPE 3 — COMPARER AVEC L'ANCIENNE SESSION
Compare ton environnement avec le §1 et le §39 de docs/HANDOFF_CLAUDE_CODE.md. Donne-moi ce tableau :

| CAPACITÉ | ANCIEN CLAUDE | NOUVEAU CLAUDE | ÉTAT (OK / partiel / non) | ACTION NÉCESSAIRE |
avec au moins ces lignes : Lire repo, Modifier fichiers, Git, Commit, Push, PR, Merge, Lancer Actions,
Lire journaux Actions, Cloudflare (checks), URL .dev, Supabase (lecture), Migrations (via workflow),
Backup, Pilote, Tests, Playwright / Chromium, Accès réseau au site, Production.
Ne coche « OK » que ce que tu as réellement vérifié.

ÉTAPE 4 — CONCLURE
Termine par quatre phrases claires :
« Je peux reproduire automatiquement : … »
« Je ne peux pas encore reproduire : … »
« Il me manque : … »
« Pour avoir la même autonomie que l'ancienne session, il faut : … » (pour chaque manque : quel accès,
à quoi, pourquoi, comment je le vérifierai une fois donné).
Rappelle aussi l'état exact du projet (§45 du handoff) et la prochaine priorité, sans l'exécuter.
```
