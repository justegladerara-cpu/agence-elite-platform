-- Rapprochement d'un fichier de catalogue (CSV « ; », en-tête comme docs/modele_import_articles.csv) avec les articles
-- d'un établissement. LECTURE SEULE : une seule requête SELECT, utilisée par scripts/reconcilier_catalogue.sql
-- (réglages de session reconciliation.csv et reconciliation.etablissement) et par tests/reconcilier_catalogue.test.js.
-- Une ligne par article du fichier ou de la base, avec un constat :
--   identique · prix_different · categorie_differente · nouveau · absent_du_fichier · a_confirmer · doublon_probable_fichier
-- et la colonne deja_vendu (articles déjà utilisés dans des ventes : ne jamais les écraser).
with recursive brut as (
  select ligne, n from regexp_split_to_table(current_setting('reconciliation.csv'), E'\r?\n') with ordinality as t(ligne, n)
),
entete as (
  select string_to_array(lower(btrim(ligne)), ';') as cols from brut where n = 1
),
fichier as (
  select b.n, string_to_array(b.ligne, ';') as v, e.cols
  from brut b, entete e
  where b.n > 1 and btrim(b.ligne) <> ''
),
f as (
  select n,
    btrim(coalesce(v[array_position(cols, 'categorie')], '')) as categorie,
    btrim(coalesce(v[array_position(cols, 'nom')], '')) as nom,
    nullif(btrim(coalesce(v[array_position(cols, 'variante')], '')), '') as variante,
    nullif(replace(replace(btrim(coalesce(v[coalesce(array_position(cols, 'prix'), array_position(cols, 'prix_vente'))], '')), ' ', ''), ',', '.'), '') as prix_txt,
    nullif(btrim(coalesce(v[array_position(cols, 'reference')], '')), '') as reference,
    nullif(btrim(coalesce(v[array_position(cols, 'motif_attente')], '')), '') as motif_attente
  from fichier
),
fn as (
  -- Clé souple : sans accents, minuscules, ponctuation et espaces réduits, « s » final retiré (pluriels simples).
  select f.*,
    regexp_replace(regexp_replace(lower(public.unaccent_simple(f.nom)), '[^a-z0-9]+', ' ', 'g'), '(^ +| +$)', '', 'g') as cle_nom,
    case when f.prix_txt ~ '^[0-9]+(\.[0-9]+)?$' then f.prix_txt::numeric end as prix
  from f
),
fk as (
  select fn.*, regexp_replace(fn.cle_nom, '([a-z]{3,})s\M', '\1', 'g') as cle_souple from fn
),
base as (
  select a.id, a.nom, a.variante, a.reference, a.prix_vente, a.actif, c.nom as categorie,
    regexp_replace(regexp_replace(lower(public.unaccent_simple(a.nom)), '[^a-z0-9]+', ' ', 'g'), '(^ +| +$)', '', 'g') as cle_nom,
    (select count(*) from public.lignes_vente lv where lv.article_id = a.id) as lignes_vendues
  from public.articles a
  left join public.categories_articles c on c.id = a.categorie_id
  where a.etablissement_id = current_setting('reconciliation.etablissement')::uuid
),
bk as (
  select base.*, regexp_replace(base.cle_nom, '([a-z]{3,})s\M', '\1', 'g') as cle_souple from base
),
appariement as (
  select fk.n, fk.categorie as categorie_fichier, fk.nom as nom_fichier, fk.variante as variante_fichier, fk.reference as reference_fichier,
         fk.prix as prix_fichier, fk.prix_txt, fk.motif_attente, fk.cle_souple as cle_fichier,
         coalesce(
           (select b.id from bk b where fk.reference is not null and b.reference = fk.reference limit 1),
           (select b.id from bk b where b.cle_nom = fk.cle_nom and coalesce(lower(btrim(b.variante)), '') = coalesce(lower(fk.variante), '') limit 1),
           (select b.id from bk b where b.cle_souple = fk.cle_souple and coalesce(lower(btrim(b.variante)), '') = coalesce(lower(fk.variante), '') limit 1)
         ) as article_id
  from fk
),
doublons as (
  select cle_fichier, coalesce(lower(variante_fichier), '') as v from appariement group by 1, 2 having count(*) > 1
),
lignes as (
  select
    case
      when a.motif_attente is not null or a.prix_fichier is null then 'a_confirmer'
      when exists (select 1 from doublons d where d.cle_fichier = a.cle_fichier and d.v = coalesce(lower(a.variante_fichier), '')) then 'doublon_probable_fichier'
      when b.id is null then 'nouveau'
      when b.prix_vente <> a.prix_fichier then 'prix_different'
      when coalesce(lower(public.unaccent_simple(b.categorie)), '') <> lower(public.unaccent_simple(a.categorie_fichier)) then 'categorie_differente'
      else 'identique'
    end as constat,
    a.categorie_fichier as categorie, a.nom_fichier as nom_fichier, b.nom as nom_base, a.variante_fichier as variante,
    a.prix_fichier, b.prix_vente as prix_base, b.categorie as categorie_base, a.reference_fichier as reference,
    coalesce(b.lignes_vendues, 0) > 0 as deja_vendu, coalesce(b.lignes_vendues, 0) as lignes_vendues, a.motif_attente, a.n as ligne_fichier
  from appariement a
  left join bk b on b.id = a.article_id
  union all
  select 'absent_du_fichier', b.categorie, null, b.nom, b.variante, null, b.prix_vente, b.categorie, b.reference,
    b.lignes_vendues > 0, b.lignes_vendues, null, null
  from bk b
  where not exists (select 1 from appariement a where a.article_id = b.id)
)
select * from lignes
order by case constat when 'prix_different' then 1 when 'categorie_differente' then 2 when 'doublon_probable_fichier' then 3
  when 'a_confirmer' then 4 when 'nouveau' then 5 when 'absent_du_fichier' then 6 else 7 end, categorie, coalesce(nom_fichier, nom_base)
