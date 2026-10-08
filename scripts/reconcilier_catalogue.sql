-- Réconciliation d'un catalogue préparé avec un établissement réel, EN LECTURE SEULE (aucune écriture possible :
-- transaction « read only » puis annulée). Aucun e-mail ni secret n'est affiché.
-- Usage : psql "$BASE_URL" -v recherche='dream' -v csv="$(cat fichier.csv)" -v sortie='reconciliation.csv' -f scripts/reconcilier_catalogue.sql
\set ON_ERROR_STOP on
\pset footer off
begin transaction read only;

\echo '== Établissement ciblé (vérifier le nom avant toute décision) =='
select e.id as etablissement_id, e.nom as etablissement, c.nom as client, e.solution_id, e.statut,
       (select count(*) from public.articles a where a.etablissement_id = e.id) as articles_en_base
from public.etablissements e join public.clients c on c.id = e.client_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%'
order by e.nom;

select count(*) = 1 as un_seul from public.etablissements e join public.clients c on c.id = e.client_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%' \gset
\if :un_seul
\else
  \echo 'ARRÊT : la recherche doit désigner exactement un établissement.'
  rollback;
  \quit
\endif
select set_config('reconciliation.etablissement', e.id::text, true) as cfg_etab, set_config('reconciliation.csv', :'csv', true) is not null as cfg_csv
from public.etablissements e join public.clients c on c.id = e.client_id
where e.nom ilike '%' || :'recherche' || '%' or c.nom ilike '%' || :'recherche' || '%' \gset

\set requete `cat scripts/reconcilier_catalogue_requete.sql`

\echo '== Synthèse =='
select constat, count(*) as lignes, count(*) filter (where deja_vendu) as dont_deja_vendus from (:requete) r group by constat order by 1;

\echo '== Totaux par catégorie (fichier) =='
select categorie, count(*) filter (where constat = 'identique') as identiques, count(*) filter (where constat = 'prix_different') as prix_differents,
       count(*) filter (where constat = 'categorie_differente') as categories_differentes, count(*) filter (where constat = 'nouveau') as nouveaux,
       count(*) filter (where constat = 'a_confirmer') as a_confirmer, count(*) filter (where constat = 'doublon_probable_fichier') as doublons
from (:requete) r where constat <> 'absent_du_fichier' group by categorie order by categorie;

\echo '== Prix différents (ancien → nouveau) =='
select nom_base, variante, prix_base as prix_actuel, prix_fichier as prix_fichier, deja_vendu, reference from (:requete) r where constat = 'prix_different';

\echo '== Catégorie différente =='
select nom_base, categorie_base as categorie_actuelle, categorie as categorie_fichier, deja_vendu from (:requete) r where constat = 'categorie_differente';

\echo '== En base mais absents du fichier (déjà vendus : à garder) =='
select nom_base, categorie_base, prix_base, deja_vendu, lignes_vendues from (:requete) r where constat = 'absent_du_fichier';

\echo '== À confirmer et doublons probables du fichier =='
select constat, nom_fichier, variante, categorie, motif_attente, ligne_fichier from (:requete) r where constat in ('a_confirmer', 'doublon_probable_fichier');

\echo '== Nouveaux (absents de la base) =='
select categorie, nom_fichier, variante, prix_fichier, reference from (:requete) r where constat = 'nouveau';

\pset format csv
\o :sortie
select * from (:requete) r;
\o
\pset format aligned
\echo 'Rapport complet écrit (artefact CSV).'
rollback;
