# CLAUDE.md — Agence Elite Platform

Ce fichier est lu automatiquement par Claude Code. Il est court exprès : le détail est dans
[`docs/HANDOFF_CLAUDE_CODE.md`](docs/HANDOFF_CLAUDE_CODE.md) (passation complète, commence par « SI TU ES UNE
NOUVELLE SESSION CLAUDE CODE, COMMENCE ICI ») et [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) (mise en ligne).

## Le projet en une phrase
Plateforme SaaS multi-client d'Agence Elite (Client → Établissement → Hubs → modules → membres / rôles / permissions),
React + Vite sur Cloudflare, base Supabase de production `xrlfedosaqtffraadmgk`. Le propriétaire est **Juste** ; il
écrit en français et veut des réponses en **français simple**.

## Mode de travail attendu
Quand Juste écrit « Ajoute [fonctionnalité] », c'est une mission **de bout en bout**, sauf indication contraire :
analyse → SOP → code → migration si besoin → tests → build → commit → push → PR → CI verte → base de production
(sauvegarde, simulation, application) → fusion → Cloudflare → vérification en ligne → documentation → **lien final**.
Ne pas s'arrêter après le code. Ne pas demander « je commit ? », « je déploie ? ».
S'arrêter seulement pour : accès ou secret manquant, action destructive, doute qui touche des données réelles,
décision commerciale. Détail : HANDOFF §34–35.

Toujours dire où on en est avec ces mots exacts : CODE PRÊT · CODE PUSHÉ · CI VERTE · MERGÉ · FRONTEND DÉPLOYÉ ·
BASE MIGRÉE · PRODUCTION VÉRIFIÉE. Ne jamais écrire « c'est en ligne » sans l'avoir vérifié.

## Règles qui ne se discutent pas
1. **Base d'abord, site ensuite.** Une migration est appliquée en production (workflow « Déploiement de la base »)
   **avant** la fusion sur `main` du code qui l'appelle. Sinon : « Could not find the function … in the schema cache ».
2. Une migration déjà sur `main` ou déjà appliquée ne se modifie jamais : on en écrit une nouvelle.
3. Aucune donnée réelle dans les tests ou la démo ; aucun import dans `Patrondemo` / « Commerce Démo » pour un vrai client.
4. Aucun secret (mot de passe, token, chaîne de connexion) dans le code, un commit, un journal, une doc ou un message.
5. Le CRM interne `agence-elite-crm` est un **autre dépôt** : ne jamais y toucher depuis ce travail.
6. Écriture en production uniquement par les workflows GitHub protégés (jamais d'`apply_migration` ni d'écriture
   SQL directe avec un connecteur, même s'il est disponible). Lecture seule autorisée pour vérifier.
7. Pas de `push --force`, pas de `rebase` sur `main`, pas de test désactivé pour passer.

## Avant de modifier quoi que ce soit
1. Lire `docs/HANDOFF_CLAUDE_CODE.md` (au moins §0, §34 à §38 et §45 « état exact »).
2. `git status`, `git branch -a`, `git log --oneline -10`, `git remote -v`.
3. Regarder les PR ouvertes : du travail peut attendre d'être fusionné (voir §45).
4. Trouver la SOP du domaine dans `docs/SOP/README.md`, la lire, puis seulement coder.

Commandes : `npm ci` · `npm test` · `npm run build` · `npm run build:demo` ·
`CHROMIUM_PATH=<chemin du chrome installé> npm run test:e2e` après `npm run build:demo` et `npx vite preview --port 4173`
(dans le conteneur cloud Claude Code : `ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome`).
