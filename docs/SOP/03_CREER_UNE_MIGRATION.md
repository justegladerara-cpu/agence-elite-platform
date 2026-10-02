# SOP 03 · Créer une migration

1. Nouveau fichier `supabase/migrations/AAAAMMJJNNNNNN_sujet.sql` : date du jour + numéro à 6 chiffres qui repart à `000001` chaque jour (voir PROJECT_STATE « Numérotation des migrations »). Toujours **après** la dernière.
2. **Jamais** modifier une migration déjà appliquée en production (voir `supabase_migrations` en base
   ou la simulation du workflow « Déploiement de la base »).
3. Écrire de façon **idempotente et non destructive** : `create … if not exists`, `add column if not exists`,
   `on conflict do nothing`, `create or replace function`. Pas de `drop table`, pas de `delete`
   sur des données métier ; une colonne obsolète est laissée puis documentée.
4. Données existantes : rétro-remplir dans la même migration (ex. Hub principal créé pour chaque
   établissement existant), en vérifiant les totaux avant/après dans un test.
5. Toute table : `enable row level security` + politiques ; toute fonction `security definer` :
   `set search_path = public` et `revoke execute … from public, anon` si elle n'est pas publique.
6. Tests : `tests/migrations.test.js` rejoue tout depuis zéro ; ajouter un test métier.
7. Push → la CI reconstruit un Supabase neuf. Puis production : [SOP 12](12_DEPLOYER_EN_PRODUCTION.md).

Modèle : [`templates/TEMPLATE_MIGRATION.sql`](templates/TEMPLATE_MIGRATION.sql).
