-- Vérification EN LECTURE SEULE d'un établissement réel avant une opération (import de catalogue, mise en service…).
-- Usage : psql "$BASE_URL" -v recherche='dream' -v identifiant='patrondream' -f scripts/verifier_etablissement.sql
-- Affiche Client → Établissement → Hubs → modules → membres (identifiants, jamais d'e-mail ni de secret) → droits
-- du compte demandé, l'état de l'import de catalogue et les volumes du catalogue, ici et ailleurs (pour comparer avant/après).
\set ON_ERROR_STOP on
\pset footer off
begin transaction read only;

\echo '== Migrations appliquées (5 dernières) =='
select version from supabase_migrations.schema_migrations order by version desc limit 5;

\echo '== Fonctions attendues présentes =='
select p.proname as fonction, pg_get_function_identity_arguments(p.oid) as signature
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('importer_catalogue', 'affecter_serveur_table', 'statistiques_serveurs_restaurant', 'enregistrer_categorie_article')
order by 1;

\echo '== Établissements dont le nom ou le client contient la recherche =='
select c.nom as client, c.statut as statut_client, e.id as etablissement_id, e.nom as etablissement, e.solution_id, e.statut,
       e.devise, e.fuseau, e.mis_en_service_le
from public.etablissements e join public.clients c on c.id = e.client_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%'
order by c.nom, e.nom;

\echo '== Hubs =='
select e.nom as etablissement, h.id as hub_id, h.nom as hub, h.principal, h.actif, h.capacite_vente
from public.hubs h join public.etablissements e on e.id = h.etablissement_id
join public.clients c on c.id = e.client_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%'
order by e.nom, h.principal desc, h.nom;

\echo '== Modules actifs =='
select e.nom as etablissement, string_agg(m.module_id, ', ' order by m.module_id) as modules
from public.etablissement_modules m join public.etablissements e on e.id = m.etablissement_id
join public.clients c on c.id = e.client_id
where m.actif and (e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%')
group by e.nom;

\echo '== Membres (identifiant de connexion, rôle, Hubs restreints) =='
select e.nom as etablissement, coalesce(cc.identifiant, '(sans identifiant)') as identifiant,
       coalesce(nullif(p.nom_affiche, ''), p.nom_complet) as nom, em.role_id, em.actif,
       (select string_agg(h.nom, ', ') from public.membre_hubs r join public.hubs h on h.id = r.hub_id
         where r.etablissement_id = em.etablissement_id and r.user_id = em.user_id) as hubs_restreints
from public.etablissement_membres em
join public.etablissements e on e.id = em.etablissement_id
join public.clients c on c.id = e.client_id
left join public.comptes_connexion cc on cc.user_id = em.user_id
left join public.profils p on p.id = em.user_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%'
order by e.nom, em.role_id;

\echo '== Établissements du compte demandé et droits utiles à l''onboarding =='
select e.nom as etablissement, em.role_id, em.actif,
       perm.id as permission,
       coalesce((em.permissions_ajustees ->> perm.id)::boolean,
         exists (select 1 from public.role_permissions rp where rp.role_id = em.role_id and rp.permission_id = perm.id)) as accorde
from public.comptes_connexion cc
join public.etablissement_membres em on em.user_id = cc.user_id
join public.etablissements e on e.id = em.etablissement_id
cross join (select id from public.permissions where id in ('articles.lire', 'articles.gerer', 'articles.categories',
  'restaurant_salle.lire', 'restaurant_salle.servir', 'restaurant_salle.gerer', 'restaurant_salle.affecter',
  'restaurant_salle.transferer', 'restaurant_salle.performances', 'restaurant_cuisine.lire', 'caisse.utiliser')) perm
where lower(cc.identifiant) = lower(:'identifiant')
order by e.nom, perm.id;

\echo '== Catalogue : volumes par établissement (comparer avant / après import) =='
select e.nom as etablissement,
       (select count(*) from public.articles a where a.etablissement_id = e.id and a.actif) as articles_en_vente,
       (select count(*) from public.articles a where a.etablissement_id = e.id and a.reference like 'DREAM-%') as articles_dream,
       (select count(*) from public.categories_articles k where k.etablissement_id = e.id) as categories,
       (select count(*) from public.rest_tables t where t.etablissement_id = e.id and t.actif) as tables
from public.etablissements e
order by e.nom;

rollback;
