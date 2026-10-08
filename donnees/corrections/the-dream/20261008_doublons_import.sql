-- Correction des doublons créés par l'import du catalogue du 2026-10-08 05:18 UTC (PR #7, écrit par SQL direct).
-- Demandée par Juste le 2026-10-08 (« corriges les fautes »). Exécutée UNIQUEMENT par le workflow « Corriger des données »
-- (simulation = tout est annulé ; appliquer = validé avec JE CONFIRME, après une sauvegarde).
-- Règles : aucune suppression ; on garde l'article ANCIEN (identifiant et historique de ventes), on archive le doublon
-- créé par l'import (jamais vendu, vérifié) ; prix gardé = moyenne arrondie à 500 FCFA (règle déjà retenue pour l'import),
-- sauf écart aberrant (×10) où le prix du menu photographié est retenu ; tout est à revoir avec le gérant.
-- Le script s'arrête si l'état de la base n'est pas exactement celui constaté le 2026-10-08.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

create temporary table corr_paires (ancien text, nouveau text, prix numeric) on commit drop;
insert into corr_paires values
  ('Cuisse de poulet sauce arachide',        'Cuisse de poulet sauce d’arachide', 3000),
  ('Ailes de poulet sauce pâte d''arachide', 'Ailes de poulet pâte d’arachide',   3000),
  ('Seau de cuisses de poulet panes',        'Seau de cuisses de poulet panées',  10000),
  ('Ailes de poulet braisé',                 'Ailes de poulet braisées',          2500),
  ('Ailes de poulet sauté',                  'Ailes de poulet sautées',           2500),
  ('Cuisse de poulet braise',                'Cuisse de poulet braisée',          3000),
  ('Cuisse de poulet sauté',                 'Cuisse de poulet sautée',           2500),
  ('Poisson Bar Braisé',                     'Poisson Bar',                       3500);

do $$
declare
  etab uuid;
  n integer;
  p record;
  a_ancien public.articles%rowtype;
  a_nouveau public.articles%rowtype;
  biere uuid;
  bieres uuid;
  journal jsonb := '[]'::jsonb;
begin
  select e.id into etab from public.etablissements e join public.clients c on c.id = e.client_id
  where e.nom = 'The Dream Lounge Bar Restaurant' and c.nom = 'The Dream Lounge Bar';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;
  select count(*) into n from public.articles where etablissement_id = etab;
  if n <> 301 then raise exception 'État inattendu : % articles (301 attendus) : arrêt', n; end if;

  for p in select * from corr_paires loop
    select * into a_ancien from public.articles
    where etablissement_id = etab and nom = p.ancien and coalesce(reference, '') not like 'DREAM-%' and actif;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Article ancien « % » : % trouvé(s), 1 attendu : arrêt', p.ancien, n; end if;
    select * into a_nouveau from public.articles
    where etablissement_id = etab and nom = p.nouveau and reference like 'DREAM-%' and actif;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Article importé « % » : % trouvé(s), 1 attendu : arrêt', p.nouveau, n; end if;
    if exists (select 1 from public.lignes_vente where article_id = a_nouveau.id)
       or exists (select 1 from public.rest_lignes where article_id = a_nouveau.id)
       or exists (select 1 from public.mouvements_stock where article_id = a_nouveau.id) then
      raise exception 'Le doublon « % » a déjà servi : arrêt, à traiter à la main', p.nouveau;
    end if;
    -- L'ancien article reprend le poste de préparation du menu et le prix retenu ; le doublon est archivé.
    update public.articles
    set prix_vente = p.prix, poste_preparation = coalesce(a_nouveau.poste_preparation, poste_preparation)
    where id = a_ancien.id;
    update public.articles set actif = false where id = a_nouveau.id;
    journal := journal || jsonb_build_object('garde', a_ancien.id, 'nom', a_ancien.nom, 'ancien_prix', a_ancien.prix_vente,
      'prix_menu', a_nouveau.prix_vente, 'prix_retenu', p.prix, 'archive', a_nouveau.id, 'reference_archivee', a_nouveau.reference);
  end loop;

  -- Catégorie en double : « Bières » (créée par l'import) rejoint « Bière » (existante), puis est archivée.
  select id into biere from public.categories_articles where etablissement_id = etab and nom = 'Bière' and archivee_le is null;
  select id into bieres from public.categories_articles where etablissement_id = etab and nom = 'Bières' and archivee_le is null;
  if biere is null or bieres is null then raise exception 'Catégories Bière / Bières introuvables : arrêt'; end if;
  update public.articles set categorie_id = biere where categorie_id = bieres;
  get diagnostics n = row_count;
  if n <> 8 then raise exception 'Bières : % article(s) déplacé(s), 8 attendus : arrêt', n; end if;
  update public.categories_articles set actif = false, archivee_le = now() where id = bieres;

  insert into public.evenements (etablissement_id, type, donnees)
  values (etab, 'catalogue.correction_doublons', jsonb_build_object(
    'source', 'donnees/corrections/the-dream/20261008_doublons_import.sql', 'articles', journal,
    'categorie_archivee', 'Bières', 'categorie_cible', 'Bière'));

  select count(*) into n from public.articles where etablissement_id = etab and actif;
  raise notice 'Résultat : % articles actifs (293 attendus), 8 doublons archivés, catégorie Bières fusionnée dans Bière', n;
  if n <> 293 then raise exception 'Résultat inattendu (% actifs) : arrêt', n; end if;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
