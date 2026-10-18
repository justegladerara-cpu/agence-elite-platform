-- Analyses (2026-10-18) : un seul appel qui donne tout le tableau « Analyses » du tableau de bord.
-- Juste : « un DASHBOARD avec des analyses de données ». Lecture seule, aucune table nouvelle.
-- Ventes validées de la période (et de la période précédente de même durée), par jour, par jour de la semaine
-- et par heure, par article, catégorie, vendeur, client, mode d'encaissement ; dépenses ; articles dormants.
-- Droits : ventes.lire (comme le tableau Commerce) ; dépenses et stock seulement avec leur propre droit de lecture.

create function public.analyse_ventes(p_etablissement_id uuid, p_du date, p_au date, p_hub_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  duree integer;
  v_depenses boolean := public.lecture_autorisee(p_etablissement_id, 'depenses.lire');
  v_stock boolean := public.lecture_autorisee(p_etablissement_id, 'stock.lire');
  v_paie boolean := public.lecture_autorisee(p_etablissement_id, 'paiements.lire');
  r jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    raise exception 'Permission refusée : ventes.lire' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Période invalide';
  end if;
  duree := p_au - p_du + 1;
  if duree > 400 then
    raise exception 'Période trop longue (400 jours au plus)';
  end if;
  if p_hub_id is not null and not public.lecture_hub(p_etablissement_id, p_hub_id) then
    raise exception 'Hub non autorisé' using errcode = '42501';
  end if;
  select coalesce(e.fuseau, 'UTC') into tz from public.etablissements e where e.id = p_etablissement_id;

  with
  v as (
    select x.id, x.total, x.montant_paye, x.vendeur, x.contact_id, x.cree_le at time zone tz as local
    from public.ventes x
    where x.etablissement_id = p_etablissement_id and x.statut = 'validee'
      and x.cree_le >= p_du::timestamp at time zone tz and x.cree_le < (p_au + 1)::timestamp at time zone tz
      and (p_hub_id is null or x.hub_id = p_hub_id)
      and (x.hub_id is null or public.lecture_hub(p_etablissement_id, x.hub_id))
  ),
  vp as (
    select x.id, x.total, x.cree_le at time zone tz as local
    from public.ventes x
    where x.etablissement_id = p_etablissement_id and x.statut = 'validee'
      and x.cree_le >= (p_du - duree)::timestamp at time zone tz and x.cree_le < p_du::timestamp at time zone tz
      and (p_hub_id is null or x.hub_id = p_hub_id)
      and (x.hub_id is null or public.lecture_hub(p_etablissement_id, x.hub_id))
  ),
  l as (
    select l.vente_id, l.article_id, l.libelle, l.quantite, l.total, l.cout_unitaire
    from public.lignes_vente l join v on v.id = l.vente_id
  ),
  paie as (
    select p.mode, p.montant
    from public.paiements p
    where v_paie and p.etablissement_id = p_etablissement_id and p.statut = 'valide'
      and p.cree_le >= p_du::timestamp at time zone tz and p.cree_le < (p_au + 1)::timestamp at time zone tz
      and (p_hub_id is null or p.hub_id = p_hub_id)
      and (p.hub_id is null or public.lecture_hub(p_etablissement_id, p.hub_id))
  ),
  dep as (
    select d.categorie, d.montant
    from public.depenses d
    where v_depenses and d.etablissement_id = p_etablissement_id and d.statut = 'valide'
      and d.date_depense between p_du and p_au
      and (p_hub_id is null or d.hub_id = p_hub_id)
      and (d.hub_id is null or public.lecture_hub(p_etablissement_id, d.hub_id))
  )
  select jsonb_build_object(
    'du', p_du, 'au', p_au, 'jours', duree, 'hub_id', p_hub_id, 'aujourdhui', (now() at time zone tz)::date,
    'totaux', jsonb_build_object(
      'chiffre', (select coalesce(sum(total), 0) from v),
      'nombre', (select count(*) from v),
      'panier_moyen', (select coalesce(round(avg(total), 2), 0) from v),
      'reste_du', (select coalesce(sum(total - montant_paye), 0) from v),
      'articles_vendus', (select coalesce(sum(quantite), 0) from l),
      'marge', (select coalesce(sum(total - quantite * cout_unitaire), 0) from l where cout_unitaire is not null),
      'chiffre_cout_connu', (select coalesce(sum(total), 0) from l where cout_unitaire is not null),
      'clients_identifies', (select count(distinct contact_id) from v where contact_id is not null),
      'chiffre_precedent', (select coalesce(sum(total), 0) from vp),
      'nombre_precedent', (select count(*) from vp),
      'encaisse', case when v_paie then (select coalesce(sum(montant), 0) from paie) end,
      'depenses', case when v_depenses then (select coalesce(sum(montant), 0) from dep) end
    ),
    'par_jour', (
      select coalesce(jsonb_agg(jsonb_build_object('jour', j.jour::date, 'chiffre', coalesce(a.chiffre, 0), 'nombre', coalesce(a.nombre, 0),
        'chiffre_precedent', coalesce(b.chiffre, 0)) order by j.jour), '[]'::jsonb)
      from generate_series(p_du, p_au, interval '1 day') as j(jour)
      left join (select local::date jour, sum(total) chiffre, count(*) nombre from v group by 1) a on a.jour = j.jour::date
      left join (select local::date + duree jour, sum(total) chiffre from vp group by 1) b on b.jour = j.jour::date
    ),
    'par_heure', (
      select coalesce(jsonb_agg(jsonb_build_object('jour_semaine', t.js, 'heure', t.h, 'chiffre', t.chiffre, 'nombre', t.nombre)), '[]'::jsonb)
      from (select extract(isodow from local)::int js, extract(hour from local)::int h, sum(total) chiffre, count(*) nombre
            from v group by 1, 2) t
    ),
    'articles', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc), '[]'::jsonb)
      from (
        select coalesce(a.nom, min(l.libelle)) libelle, sum(l.quantite) quantite, sum(l.total) chiffre, count(distinct l.vente_id) ventes,
          case when bool_and(l.cout_unitaire is not null) then sum(l.total - l.quantite * l.cout_unitaire) end marge
        from l left join public.articles a on a.id = l.article_id
        group by l.article_id, a.nom
        order by sum(l.total) desc
        limit 15
      ) t
    ),
    'categories', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc), '[]'::jsonb)
      from (
        select coalesce(c.nom, 'Sans catégorie') libelle, sum(l.total) chiffre, sum(l.quantite) quantite
        from l left join public.articles a on a.id = l.article_id
        left join public.categories_articles c on c.id = a.categorie_id
        group by 1 order by 2 desc limit 12
      ) t
    ),
    'vendeurs', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc), '[]'::jsonb)
      from (
        select public.cockpit_nom_utilisateur(vendeur) libelle, count(*) nombre, sum(total) chiffre, round(avg(total), 2) panier_moyen
        from v group by vendeur order by 3 desc limit 12
      ) t
    ),
    'clients', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc), '[]'::jsonb)
      from (
        select ct.nom libelle, count(*) nombre, sum(v.total) chiffre, sum(v.total - v.montant_paye) reste_du
        from v join public.contacts ct on ct.id = v.contact_id
        group by ct.id, ct.nom order by 3 desc limit 10
      ) t
    ),
    'modes', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.montant desc), '[]'::jsonb)
      from (select mode, sum(montant) montant, count(*) nombre from paie group by mode) t
    ),
    'depenses', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.montant desc), '[]'::jsonb)
      from (select categorie libelle, sum(montant) montant from dep group by categorie order by 2 desc limit 10) t
    ),
    'dormants', case when v_stock then (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.valeur desc), '[]'::jsonb)
      from (
        select a.nom libelle, sum(s.quantite) quantite, sum(s.quantite) * coalesce(a.cout_achat, 0) valeur
        from public.articles a join public.stock_hubs s on s.article_id = a.id
          and (p_hub_id is null or s.hub_id = p_hub_id) and public.lecture_hub(p_etablissement_id, s.hub_id)
        where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
          and not exists (select 1 from l where l.article_id = a.id)
        group by a.id, a.nom, a.cout_achat having sum(s.quantite) > 0
        order by 3 desc limit 10
      ) t) end
  ) into r;
  return r;
end
$$;
revoke execute on function public.analyse_ventes(uuid, date, date, uuid) from public, anon;
grant execute on function public.analyse_ventes(uuid, date, date, uuid) to authenticated;
