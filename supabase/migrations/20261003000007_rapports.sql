-- Rapports : analyse des ventes par période, article, catégorie, vendeur, client, Hub, origine et mode d'encaissement,
-- avec comparaison à la période précédente et marge. Lecture seule : aucune table, aucune écriture.
-- Les Hubs que l'utilisateur ne peut pas lire sont exclus (lecture_hub), comme dans le tableau de bord.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('rapports', 'Rapports et analyses', 'Ventes par période, article, catégorie, vendeur, client, Hub, origine ; marge ; export CSV.',
   'transversal', 'actif', 'reporting', 'graphique', 15, '1.0', 'docs/RAPPORTS.md')
on conflict (id) do nothing;
insert into public.module_dependances (module_id, depend_de) values ('rapports', 'ventes')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'rapports', false from public.solutions s where s.id in ('commerce', 'restaurant', 'hotel', 'ecommerce', 'services')
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('rapports.lire', 'rapports', 'Consulter et exporter les rapports de ventes')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'rapports.lire' from unnest(array['gerant', 'responsable', 'comptable', 'responsable_hub', 'lecteur']) r
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Rapport des ventes
-- ---------------------------------------------------------------------------
-- Ventes validées lisibles par l'utilisateur, date locale de l'établissement (interne).
create function public.ventes_rapport(p_etablissement_id uuid, p_du date, p_au date, p_hub_id uuid)
returns table (id uuid, jour date, total numeric, hub_id uuid, vendeur uuid, contact_id uuid, origine text)
language sql
stable
security definer
set search_path = ''
as $$
  with fuseau as (select coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC') tz)
  select v.id, (v.cree_le at time zone f.tz)::date, v.total, v.hub_id, v.vendeur, v.contact_id, v.origine
  from public.ventes v, fuseau f
  where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
    and v.cree_le >= p_du::timestamp at time zone f.tz and v.cree_le < (p_au + 1)::timestamp at time zone f.tz
    and (p_hub_id is null or v.hub_id = p_hub_id)
    and (v.hub_id is null or public.lecture_hub(p_etablissement_id, v.hub_id))
$$;

-- p_axe : jour, semaine, mois, article, categorie, vendeur, client, hub, origine, mode.
-- Ventes validées dont la date (fuseau de l'établissement) est dans [p_du, p_au] ; 3 ans au plus.
create function public.rapport_ventes(p_etablissement_id uuid, p_du date, p_au date, p_axe text, p_hub_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  duree integer;
  lignes jsonb;
  totaux jsonb;
  precedent numeric;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rapports.lire') then
    raise exception 'Permission refusée : rapports.lire' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Période invalide';
  end if;
  duree := p_au - p_du + 1;
  if duree > 1100 then
    raise exception 'Période trop longue (3 ans au plus)';
  end if;
  if p_axe not in ('jour', 'semaine', 'mois', 'article', 'categorie', 'vendeur', 'client', 'hub', 'origine', 'mode') then
    raise exception 'Axe d''analyse inconnu : %', p_axe;
  end if;
  if p_hub_id is not null and not public.lecture_hub(p_etablissement_id, p_hub_id) then
    raise exception 'Hub non autorisé' using errcode = '42501';
  end if;
  select coalesce(e.fuseau, 'UTC') into tz from public.etablissements e where e.id = p_etablissement_id;

  select coalesce(sum(x.total), 0) into precedent from public.ventes_rapport(p_etablissement_id, p_du - duree, p_du - 1, p_hub_id) x;

  with lv as (
    select l.vente_id, l.article_id, l.quantite, l.total, l.total - l.quantite * l.cout_unitaire as marge,
      l.cout_unitaire is not null as cout_connu
    from public.lignes_vente l join public.ventes_rapport(p_etablissement_id, p_du, p_au, p_hub_id) v on v.id = l.vente_id
  )
  select jsonb_build_object(
    'chiffre', coalesce(sum(v.total), 0),
    'nombre', count(*),
    'panier_moyen', coalesce(round(avg(v.total), 2), 0),
    'marge', (select coalesce(sum(marge), 0) from lv where cout_connu),
    'chiffre_cout_connu', (select coalesce(sum(total), 0) from lv where cout_connu),
    'chiffre_precedent', precedent,
    'evolution', case when precedent > 0 then round((coalesce(sum(v.total), 0) - precedent) * 100 / precedent, 1) end
  ) into totaux
  from public.ventes_rapport(p_etablissement_id, p_du, p_au, p_hub_id) v;

  if p_axe = 'mode' then
    select coalesce(jsonb_agg(jsonb_build_object('cle', t.mode, 'libelle', t.mode, 'nombre', t.nombre, 'chiffre', t.montant)
      order by t.montant desc), '[]'::jsonb) into lignes
    from (
      select p.mode, count(*) nombre, sum(p.montant) montant
      from public.paiements p
      where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
        and p.cree_le >= p_du::timestamp at time zone tz and p.cree_le < (p_au + 1)::timestamp at time zone tz
        and (p_hub_id is null or p.hub_id = p_hub_id)
        and (p.hub_id is null or public.lecture_hub(p_etablissement_id, p.hub_id))
      group by p.mode
    ) t;
  elsif p_axe in ('article', 'categorie') then
    select coalesce(jsonb_agg(jsonb_build_object('cle', t.cle, 'libelle', t.libelle, 'nombre', t.nombre, 'quantite', t.quantite,
      'chiffre', t.chiffre, 'marge', t.marge) order by t.chiffre desc), '[]'::jsonb) into lignes
    from (
      select case when p_axe = 'article' then coalesce(a.id::text, 'libre:' || l.libelle) else coalesce(c.id::text, '') end cle,
        case when p_axe = 'article' then coalesce(a.nom, l.libelle) else coalesce(c.nom, 'Sans catégorie') end libelle,
        count(distinct l.vente_id) nombre, sum(l.quantite) quantite, sum(l.total) chiffre,
        case when bool_and(l.cout_unitaire is not null) then sum(l.total - l.quantite * l.cout_unitaire) end marge
      from public.lignes_vente l
      join public.ventes_rapport(p_etablissement_id, p_du, p_au, p_hub_id) v on v.id = l.vente_id
      left join public.articles a on a.id = l.article_id
      left join public.categories_articles c on c.id = a.categorie_id
      group by 1, 2
      order by 5 desc
      limit 500
    ) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('cle', t.cle, 'libelle', t.libelle, 'nombre', t.nombre, 'chiffre', t.chiffre)
      order by case when p_axe in ('jour', 'semaine', 'mois') then t.cle end, t.chiffre desc), '[]'::jsonb) into lignes
    from (
      select
        case p_axe
          when 'jour' then v.jour::text
          when 'semaine' then date_trunc('week', v.jour)::date::text
          when 'mois' then to_char(v.jour, 'YYYY-MM')
          when 'vendeur' then v.vendeur::text
          when 'client' then coalesce(v.contact_id::text, '')
          when 'hub' then coalesce(v.hub_id::text, '')
          else v.origine
        end cle,
        case p_axe
          when 'jour' then to_char(v.jour, 'DD/MM/YYYY')
          when 'semaine' then 'Semaine du ' || to_char(date_trunc('week', v.jour), 'DD/MM/YYYY')
          when 'mois' then to_char(v.jour, 'MM/YYYY')
          when 'vendeur' then coalesce((select nullif(pr.nom_complet, '') from public.profils pr where pr.id = v.vendeur),
                                       (select split_part(u.email, '@', 1) from auth.users u where u.id = v.vendeur))
          when 'client' then coalesce((select ct.nom from public.contacts ct where ct.id = v.contact_id), 'Client de passage')
          when 'hub' then coalesce((select h.nom from public.hubs h where h.id = v.hub_id), 'Sans Hub')
          else v.origine
        end libelle,
        count(*) nombre, sum(v.total) chiffre
      from public.ventes_rapport(p_etablissement_id, p_du, p_au, p_hub_id) v
      group by 1, 2
      order by 4 desc
      limit 1100
    ) t;
  end if;

  return jsonb_build_object('du', p_du, 'au', p_au, 'axe', p_axe, 'hub_id', p_hub_id, 'totaux', totaux, 'lignes', lignes);
end
$$;

revoke execute on function public.rapport_ventes(uuid, date, date, text, uuid) from public, anon;
grant execute on function public.rapport_ventes(uuid, date, date, text, uuid) to authenticated;
revoke execute on function public.ventes_rapport(uuid, date, date, uuid) from public, anon, authenticated;
