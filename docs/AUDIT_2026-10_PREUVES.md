# Preuves de l’audit 013 — 2026-10-08

Ces résultats sont **locaux**. Aucun run CI/base/pilote actuel obtenu, aucune PR créée et aucune publication de cette mission. Main distant relu :6cf7517b54e941a0c7a78e1997bb9eb9cd796526.

## Commandes et résultats

| Contrôle | Résultat |
|---|---|
| npm ci sur main actuel | Succès après blocage esbuild sandbox ; lockfile inchangé |
| npm test ×3 sur main |478/478 dans 49 fichiers à chacun des trois passages |
| builds main et démo initiaux | Succès, dépassement500kB confirmé |
| E2E Commerce/Restaurant initiaux | Succès, console vide |
| Restaurant 20 répétitions initiales | Succès ; ne prouve pas absence d’instabilité |
| Restaurant horodatages égaux AVANT |4 échecs/11 réussites, les deux erreurs du mandat reproduites |
| Restaurant même fixture APRÈS |15/15, assertions métier conservées |
| Contrat tri AVANT/APRÈS |7échecs3 réussites →10/10 ; six appels corrigés |
| Catalogue sécurité AVANT/APRÈS |4échecs3 réussites →7/7 |
| Tests offensifs | Promotions directes et helper hors établissement refusés après ; RPC légitime, verrous et rejeu fictif contrôlés |
| Garde données fictives AVANT/APRÈS |Référence CSV réel détectée → garde et tests d’import passent |
| Lint AVANT/APRÈS |76erreurs/5directives obsolètes → zéroerreur ; aucun hook conditionnel trouvé |
| Modèle migration documentaire AVANT/APRÈS |2 échecs (fonction inexistante) →2 réussites compilation/rejeu |
| Taille build AVANT/APRÈS |894662/1676737 octets → tous lesJS<=500000 octets |
| Impression AVANT/APRÈS |TicketA4 et contenuA4 de largeur différente → ticket80mm, A4, mêmes contenus/dimensions |
| Profils/pages locaux |1634 relevés métier +42éditeur,1360/820/390px, zéroerreur visible/débordement |
| Quittance sourcePR #11 hors dépôt |Rendu fictif conforme aperçu/PDF ; aucune preuve RPC/base production |
| Intégration globale e50a8a9 |npmci, lint0,509/509 tests56 fichiers, deuxbuilds, tousJS<=500000 octets |

Le rendu de page n’est pas la preuve de chaque action de sous-route. Les lectures sans filtre établissement explicite sont inventoriées ; RLS et appartenance des RPC sont la frontière. Les tests de délégation SECURITYDEFINER sont structurels, pas une preuve formelle de toutes les branches.

## Vérification navigateur de la combinaison finale

Le build démo combiné est copié dans /workspace/audit-013/demo-global-final, immuable pendant les tests ; preview au port4173. Les suites SQL sont terminées avant les parcours pour éviter la contention CPU de ce cloud. Les commandes et assertions des parcours ne sont pas modifiées.

- CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e : succès, Commerce/stock/annulation/clôture/modules/mobile, aucune erreur console.
- CHROMIUM_PATH=/usr/bin/chromium node scripts/parcours_restaurant.cjs : succès, affectation/commande/transfert/catégories/serveurs et ordinateur/tablette/téléphone, aucune erreur console.
- URL_IMPRESSION=http://127.0.0.1:4175/tests/navigateur/impression.html CHROMIUM_PATH=/usr/bin/chromium node scripts/verifier_impression.cjs : succès, HTML/police/largeur/PDF/une page/mobile/console.

Ces parcours se déroulent uniquement sur des données démo entièrement fictives, sans Supabase distant. La couverture de la quittance PR11 reste un rendu source hors dépôt avec RPC fictive, décrit dans l’audit.

## Branches poussées, preuve git ls-remote

| Sujet | Branche | Commit distant confirmé |
|---|---|---|
| tests-fictifs | `codex/audit-013-tests-fictifs` | `3a68c2f46953361010faca51c88370bbcdad3352` |
| contrats-api | `codex/audit-013-contrats-api` | `0054a8847a44da795c698202df43a73893955224` |
| securite-base | `codex/audit-013-securite-base` | `48ad3b39328dea68843a6a91f53a82a081a735c8` |
| lint-ci | `codex/audit-013-lint-ci` | `89a10dfd5a2430322a2bc4354e1df3fac101f1f6` |
| chargement-pages | `codex/audit-013-chargement-pages` | `03d312f4e6eecc31e78570fe358c485a12e0110b` |
| restaurant-tests | `codex/audit-013-restaurant-tests` | `db2a042dbdc6cb2e5c6e10b1848e16fb74efee49` |
| impression | `codex/audit-013-impression` | `c5401058a674aca2ea0144a4808f684f40080a3d` |

## Résolutions d’intégration à conserver

La branche locale de vérification réunit les deux étapes de catalogue CI en une seule exécutant contrats_api.test.js et securite_catalogue.test.js après db reset, conserve trierLignes tout en supprimant React inutilisé, réunit Babelparser/ESLint/hooks/Inter et les scripts build/lint. Lockfile normalisé par npm install --package-lock-only --ignore-scripts --offline. Ce travail est enregistré dans e50a8a9 et ses commits parents ; pas de push main.

## Empreintes des logs bruts conservés dans le workspace

Les logs suivants sont les preuves exactes locales ; leurs empreintes permettent d’identifier le fichier examiné. Les chemins /tmp restent propres à ce workspace. Les résultats pertinents sont transcrits ci-dessus pour survivre à son arrêt. Aucun identifiant de client réel ni secret ajouté dans ces preuves.

| Fichier local | SHA256 |
|---|---|
| `/tmp/audit-013-tests-1.log` | `38ea5fc5b2b02a4d66249417e28c134fdb670e9462ec0446aa0c55cc6a92460d` |
| `/tmp/audit-013-tests-2.log` | `c83a78cda8e5b4807ddf62a471c982ccd8ed754a56895f6b6d534d7cb491263d` |
| `/tmp/audit-013-tests-3.log` | `29f9475689ab4ce62030e7283b831680563a36ddf72893b10d88ec903d8fd928` |
| `/tmp/audit-013-restaurant-horloge-avant.log` | `517785b527cc8d32d8da0a90f85dff199cccb77b3bb8f2a3f96764b3d7f51ab3` |
| `/tmp/audit-013-restaurant-horloge-apres-final.log` | `4bb3711d23a7bca1facfc3013975b971dbdcbbafb440d889ce648bb05d160184` |
| `/tmp/audit-013-tri-avant.log` | `94b01a6766d889cf17bbfb6766e39dca811e881bc54487a4f90e37abd4e9b005` |
| `/tmp/audit-013-tri-apres.log` | `5929f5ce110bf4371706cb4a0250048480e4598132d818bf7db785b493d665ae` |
| `/tmp/audit-013-catalogue-avant.log` | `ba55aedb64c4f9d2f527788d51fa6c94f00287c9eef9d031df0b2cec9efdfbe8` |
| `/tmp/audit-013-securite-apres.log` | `c9a34864112c214e5487d82d2b2c9eee6011215967d1610a7f345853779e1df5` |
| `/tmp/audit-013-securite-preuve-apres.log` | `446a039029585b0ea483a1339c188e8a9660ee46eb66484b1d7bc7043b966d9b` |
| `/tmp/audit-013-fictif-avant.log` | `9c05f99ea4d6c1a5d0b165b3dd3a648eff868087ac0dcad3b6037995b4ee8638` |
| `/tmp/audit-013-fictif-apres.log` | `ea7fd8cfb588b59fecba7da9a483fe1755154dba04574a70116161c25379f346` |
| `/tmp/audit-013-template-avant.log` | `6892cb835be854400c0a4bc89fb1206ffe02a6ba166c3a5d6d29e149b523bbb0` |
| `/tmp/audit-013-template-apres.log` | `fb046747444dee7a311513ae801b5546dd960dfa500cc7efb532966c0bcbe971` |
| `/tmp/audit-013-taille-avant.log` | `67176bc7ceeb00d41e535bd9310732ea5f2d3ad1981b2af7897181a6c8751745` |
| `/tmp/audit-013-lint-apres.log` | `3bd6bb8b8022985142a68b632a2c1f8107ee19884a89652ab58a627351edc47e` |
| `/tmp/audit-013-impression-avant-final.log` | `57087599bcf47f0061cced4ed8beec72c0aaeef19b1dbd661b2433e94d4d8b5e` |
| `/tmp/audit-013-impression-apres-final.log` | `52cfb55bd78470e2422d7e59c32d475799b9b398c60af87fa4a261c3b28c951b` |
| `/tmp/audit-013-quittance-source.log` | `c6616a1cd14c38097df1814a6d1945f33a0bf05bb74874c678d9c614ab0c945a` |
| `/tmp/audit-013-integration-ci.log` | `9dd98092fc57c7873394d7a430d1fba25e040ec826e71b09c45dfd7617373aea` |
| `/tmp/audit-013-integration-tests.log` | `5ed3df30450787380ef6cdbba6ac81440201b246ffd1816c6733313cf26a75ad` |
| `/tmp/audit-013-integration-build.log` | `5eee3a98687de121d9f994913e3f97a2517d6f7d089ac5fc24609beab4193545` |
| `/tmp/audit-013-integration-demo.log` | `399659cb87fd20d2aab1b88e6e38f0365d71af8e49d9570dfe798e67f40a928a` |
| `/tmp/audit-013-integration-impression.log` | `52cfb55bd78470e2422d7e59c32d475799b9b398c60af87fa4a261c3b28c951b` |

## Accès externes et liens de runs

- gh pr list et gh api pulls : Forbidden. gh pr create (thèmes API puis sécurité) : GraphQLForbidden. AucunePR créée/attachée.
- gh workflow run adresse-site.yml surmain : Forbidden, non lancé.
- gh workflow run pilote-production.yml surmain, site=https://saas.agence-elite.fr : Forbidden, non lancé.
- Supabase get_advisors/migrations/SELECT : aucun outil disponible. Avis du mandat conservés comme données transmises, jamais mesures de ce chat.
- Supabase start local : registre public.ecr.aws CONNECT403, reconstruction Docker non réalisée. Aucun démarrage distant.
- Site officiel : CONNECT403 du proxy, pas une réponseHTTP du site.
- CI, déploiementbase, sauvegarde, pilote et Cloudflare : **aucun lien actuel accessible ni run de la mission**. Pas de lien inventé. Les versions checkout/setup-node sont vérifiées par tags et README des dépôts officiels.

Log final commerce : `/tmp/audit-013-integration-commerce.log` ; SHA256 `92fb49d35df8a9b6d350623c6e68b8988024d8e73a02fe711e189a823676ec5a` ; code retour0 confirmé.

Log final restaurant : `/tmp/audit-013-integration-restaurant.log` ; SHA256 `c3684d9fa51790d8b4551818941dd916183e446b5e3ef8925bcfff8ad485bade` ; code retour0 confirmé.

Diff migrations main→combinaison : seulement2ajouts20261012000001/2 ; aucune modification/suppression d’une migration historique.
